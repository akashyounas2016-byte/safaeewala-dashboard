import { useState, useEffect, useMemo } from 'react'
import {
  Globe, Send, Search, Filter, ExternalLink, Calendar, Phone,
  Mail, MessageSquare, CheckCircle, Clock, AlertTriangle, ArrowUpRight,
  TrendingUp, BarChart3, Plus, Trash2, Eye, Copy, Check, RefreshCw,
  FileSpreadsheet, Sparkles, Building, ChevronRight, X, SlidersHorizontal, Bell,
  GripVertical, ChevronUp, ChevronDown, CalendarDays, Pencil, Save
} from 'lucide-react'
import { useLayout } from '@/components/layout/Layout'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { formatDate } from '@/lib/utils'
import { useData } from '@/store/DataContext'
import { confirmAsync } from '@/lib/notify'
import type { FluentFormLead, LeadStatus } from '@/types'
import {
  fetchFluentFormLeads,
  saveLeadsLocally,
  updateFluentFormLeadStatus,
  updateFluentFormLead,
  deleteFluentFormLeadRemote,
  exportLeadsToXLSX,
  getWebhookConfig,
  resolvePropertyType,
  isDummyLead,
  markFluentFormsAsRead,
  markSingleFluentFormAsRead,
} from '@/lib/fluentFormsSync'
import { LeadsKanban } from '@/components/leads/LeadsKanban'
import { findDuplicateLeads } from '@/lib/leads'
import { sendGHLBookingConfirmation } from '@/lib/ghlService'

/* ─── Column Customization Definitions ─── */
interface FluentColDef {
  id: string
  label: string
}

export const ALL_FLUENT_COLS: FluentColDef[] = [
  { id: 'submitted_at',   label: 'Submitted At' },
  { id: 'client_name',    label: 'Client' },
  { id: 'contact',        label: 'Contact' },
  { id: 'service_needed', label: 'Service Needed' },
  { id: 'property_type',  label: 'Property Type' },
  { id: 'area_location',  label: 'Area / Location' },
  { id: 'preferred_date', label: 'Preferred Date' },
  { id: 'page_source',    label: 'Page Source' },
  { id: 'status',         label: 'Status' },
  { id: 'actions',        label: 'Actions' },
]

export const DEFAULT_FLUENT_COL_ORDER: string[] = [
  'submitted_at',
  'client_name',
  'contact',
  'service_needed',
  'property_type',
  'area_location',
  'preferred_date',
  'page_source',
  'status',
  'actions',
]

export const DEFAULT_VISIBLE_FLUENT_COLS: Record<string, boolean> = {
  submitted_at: true,
  client_name: true,
  contact: true,
  service_needed: true,
  property_type: true,
  area_location: true,
  preferred_date: true,
  page_source: true,
  status: true,
  actions: true,
}

/* ─── Helper to resolve Preferred Date from lead / raw payload ─── */
export function resolvePreferredDate(lead: FluentFormLead): string {
  if (lead.preferred_date) return lead.preferred_date
  if (lead.raw_data) {
    const raw = lead.raw_data
    if (raw.date) return String(raw.date)
    if (raw.preferred_date) return String(raw.preferred_date)
    if (raw.preferredDate) return String(raw.preferredDate)
    if (raw.booking_date) return String(raw.booking_date)
    if (raw.scheduled_date) return String(raw.scheduled_date)
  }
  return ''
}

/* ─── Status Styles ─── */
const statusBadgeConfig: Record<LeadStatus, { label: string; bg: string; text: string; border: string }> = {
  new:       { label: 'New Lead',   bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200' },
  contacted: { label: 'Contacted',  bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200' },
  quoted:    { label: 'Quoted',     bg: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-200' },
  converted: { label: 'Converted',  bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  lost:      { label: 'Lost',       bg: 'bg-slate-100',  text: 'text-slate-600',   border: 'border-slate-200' },
}

/* ─── Category Styles ─── */
const categoryColors: Record<string, { bg: string; text: string }> = {
  'Deep Cleaning':   { bg: 'bg-teal-50',   text: 'text-teal-700' },
  'Move In / Out':   { bg: 'bg-indigo-50', text: 'text-indigo-700' },
  'Sofa & Carpet':   { bg: 'bg-amber-50',  text: 'text-amber-800' },
  'Villa Cleaning':  { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  'General Cleaning':{ bg: 'bg-blue-50',    text: 'text-blue-700' },
  'Office Cleaning': { bg: 'bg-purple-50',  text: 'text-purple-700' },
  'AC Duct':         { bg: 'bg-cyan-50',    text: 'text-cyan-700' },
  'Window Cleaning': { bg: 'bg-sky-50',     text: 'text-sky-700' },
}

/* ─── Local Date Helpers (Safe against UTC / local time mismatches) ─── */
function getLeadLocalDate(raw: string | undefined): string {
  if (!raw) return ''
  try {
    const d = new Date(raw)
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    }
  } catch {}
  return (raw || '').split('T')[0]
}

function getTodayLocalDate(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getDaysAgoLocalDate(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function FluentFormsLeads() {
  const { bookings, addBooking, clients } = useData()
  const { openMenu } = useLayout()

  const [leads, setLeads]               = useState<FluentFormLead[]>([])
  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')
  const [pageFilter, setPageFilter]     = useState('ALL')
  const [catFilter, setCatFilter]       = useState('ALL')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')

  // Date filters: 3 days, 7 days, 30 days, 3 months, 6 months, 1 year, custom
  type FluentDatePreset = 'all' | '3days' | '7days' | '30days' | '3months' | '6months' | '1year' | 'custom'
  const [datePreset, setDatePreset]           = useState<FluentDatePreset>('all')
  const [customStartDate, setCustomStartDate] = useState<string>('')
  const [customEndDate, setCustomEndDate]     = useState<string>('')

  // Column Visibility & Sequence Order state
  const [showColMenu, setShowColMenu] = useState(false)
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('safaeewala_fluent_form_cols')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.client_contact !== undefined) {
          parsed.client_name = parsed.client_contact
          parsed.contact = parsed.client_contact
          delete parsed.client_contact
        }
        if (parsed.client_name === undefined) parsed.client_name = true
        if (parsed.contact === undefined) parsed.contact = true
        if (parsed.preferred_date === undefined) parsed.preferred_date = true
        return { ...DEFAULT_VISIBLE_FLUENT_COLS, ...parsed }
      }
    } catch {}
    return DEFAULT_VISIBLE_FLUENT_COLS
  })

  const [colOrder, setColOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('safaeewala_fluent_form_col_order')
      if (saved) {
        let parsed: string[] = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) {
          if (parsed.includes('client_contact')) {
            const ccIdx = parsed.indexOf('client_contact')
            parsed.splice(ccIdx, 1, 'client_name', 'contact')
          }
          if (!parsed.includes('client_name')) {
            const subIdx = parsed.indexOf('submitted_at')
            parsed.splice(subIdx !== -1 ? subIdx + 1 : 0, 0, 'client_name')
          }
          if (!parsed.includes('contact')) {
            const clIdx = parsed.indexOf('client_name')
            parsed.splice(clIdx !== -1 ? clIdx + 1 : 1, 0, 'contact')
          }
          if (!parsed.includes('preferred_date')) {
            const areaIdx = parsed.indexOf('area_location')
            if (areaIdx !== -1) {
              parsed.splice(areaIdx + 1, 0, 'preferred_date')
            } else {
              parsed.push('preferred_date')
            }
          }
          const valid = parsed.filter(id => DEFAULT_FLUENT_COL_ORDER.includes(id))
          const missing = DEFAULT_FLUENT_COL_ORDER.filter(id => !valid.includes(id))
          return [...valid, ...missing]
        }
      }
    } catch {}
    return DEFAULT_FLUENT_COL_ORDER
  })

  // Drag-and-drop state for column reordering
  const [draggedColId, setDraggedColId] = useState<string | null>(null)
  const [dragOverColId, setDragOverColId] = useState<string | null>(null)

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedColId(id)
    e.dataTransfer.setData('text/plain', id)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverColId !== id) {
      setDragOverColId(id)
    }
  }

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    if (!draggedColId || draggedColId === targetId) {
      setDraggedColId(null)
      setDragOverColId(null)
      return
    }

    setColOrder(prev => {
      const next = [...prev]
      const fromIdx = next.indexOf(draggedColId)
      const toIdx = next.indexOf(targetId)
      if (fromIdx !== -1 && toIdx !== -1) {
        const [removed] = next.splice(fromIdx, 1)
        next.splice(toIdx, 0, removed)
        try {
          localStorage.setItem('safaeewala_fluent_form_col_order', JSON.stringify(next))
        } catch {}
      }
      return next
    })

    setDraggedColId(null)
    setDragOverColId(null)
  }

  const handleDragEnd = () => {
    setDraggedColId(null)
    setDragOverColId(null)
  }

  const moveColumn = (colId: string, direction: 'up' | 'down') => {
    setColOrder(prev => {
      const idx = prev.indexOf(colId)
      if (idx === -1) return prev
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1
      if (targetIdx < 0 || targetIdx >= prev.length) return prev
      const next = [...prev]
      const [removed] = next.splice(idx, 1)
      next.splice(targetIdx, 0, removed)
      try {
        localStorage.setItem('safaeewala_fluent_form_col_order', JSON.stringify(next))
      } catch {}
      return next
    })
  }

  const toggleColumn = (colId: string) => {
    setVisibleCols(prev => {
      const next = { ...prev, [colId]: !prev[colId] }
      try {
        localStorage.setItem('safaeewala_fluent_form_cols', JSON.stringify(next))
      } catch {}
      return next
    })
  }

  const resetColumns = () => {
    setVisibleCols(DEFAULT_VISIBLE_FLUENT_COLS)
    setColOrder(DEFAULT_FLUENT_COL_ORDER)
    try {
      localStorage.removeItem('safaeewala_fluent_form_cols')
      localStorage.removeItem('safaeewala_fluent_form_col_order')
    } catch {}
  }

  // Modals state
  const [showWebhookModal, setShowWebhookModal] = useState(false)
  const [selectedLead, setSelectedLead]         = useState<FluentFormLead | null>(null)
  const [boardView, setBoardView]               = useState(false) // UX-23 pipeline board
  const [isEditingLead, setIsEditingLead]       = useState(false)
  const [convertingLead, setConvertingLead]     = useState<FluentFormLead | null>(null)
  const [copiedUrl, setCopiedUrl]               = useState(false)
  const [copiedCurl, setCopiedCurl]             = useState(false)
  const [toastNotice, setToastNotice]           = useState<string | null>(null)
  const [testingWebhook, setTestingWebhook]     = useState(false)

  // Show toast notification
  const triggerToast = (msg: string) => {
    setToastNotice(msg)
    setTimeout(() => setToastNotice(null), 4000)
  }

  // Save edited lead submission
  const handleSaveLeadEdit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!selectedLead) return

    const fd = new FormData(e.currentTarget)
    const newStatus = fd.get('status') as LeadStatus
    const statusChangedToConverted = newStatus === 'converted' && selectedLead.status !== 'converted'

    const updates: Partial<FluentFormLead> = {
      client_name: (fd.get('client_name') as string)?.trim() || selectedLead.client_name,
      phone: (fd.get('phone') as string)?.trim() || selectedLead.phone,
      email: (fd.get('email') as string)?.trim() || selectedLead.email,
      service: (fd.get('service') as string)?.trim() || selectedLead.service,
      property_type: (fd.get('property_type') as string)?.trim() || selectedLead.property_type,
      area: (fd.get('area') as string)?.trim() || selectedLead.area,
      address: (fd.get('address') as string)?.trim() || selectedLead.address,
      preferred_date: (fd.get('preferred_date') as string)?.trim() || selectedLead.preferred_date,
      preferred_time: (fd.get('preferred_time') as string)?.trim() || selectedLead.preferred_time,
      estimated_value: Number(fd.get('estimated_value')) || selectedLead.estimated_value || 0,
      status: newStatus || selectedLead.status,
      message: (fd.get('message') as string)?.trim() || selectedLead.message,
    }

    const updatedLead: FluentFormLead = {
      ...selectedLead,
      ...updates,
    }

    // Update in-memory state
    setLeads(prev => {
      const next = prev.map(l => l.id === selectedLead.id ? updatedLead : l)
      saveLeadsLocally(next)
      return next
    })

    // Update remote / VPS
    await updateFluentFormLead(selectedLead.id, updates)

    setSelectedLead(updatedLead)
    setIsEditingLead(false)
    triggerToast('✓ Lead submission successfully updated!')

    // If status changed to converted during edit, auto-sync to bookings
    if (statusChangedToConverted) {
      handleStatusChange(selectedLead.id, 'converted')
    }
  }

  // Load leads on mount and auto-poll every 12 seconds for incoming form submissions
  useEffect(() => {
    let mounted = true
    const loadData = async () => {
      try {
        const data = await fetchFluentFormLeads()
        if (mounted) {
          const realData = (data || []).filter(l => !isDummyLead(l))
          setLeads(realData)
          setLoading(false)
          // Automatically mark all loaded forms as read so the dynamic sidebar counter resets
          markFluentFormsAsRead(realData)
        }
      } catch {}
    }
    loadData()
    const timer = setInterval(loadData, 12000)
    return () => {
      mounted = false
      clearInterval(timer)
    }
  }, [])

  // Send a test lead directly to verify the webhook receiver
  const handleSendTestLead = async () => {
    setTestingWebhook(true)
    try {
      const res = await fetch('/api/webhook/fluent-forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          your_name: 'Tariq Mehmood',
          phone: '+971 50 123 4567',
          service_needed: 'Deep Cleaning',
          property_type: 'Apartment',
          area_location: 'Shoreline Apartments # 6',
          preferred_date: new Date().toISOString().split('T')[0],
          source_url: 'https://safaeewala.com/services/deep-cleaning',
        })
      })
      if (res.ok) {
        const fresh = await fetchFluentFormLeads()
        setLeads((fresh || []).filter(l => !isDummyLead(l)))
        triggerToast('✓ Test lead successfully received & added to CRM table!')
      } else {
        triggerToast('Webhook server responded with an error.')
      }
    } catch (e: any) {
      triggerToast(`Could not send test lead: ${e.message}`)
    } finally {
      setTestingWebhook(false)
    }
  }

  // Update lead status with automatic Bookings tab sync on 'converted'
  const handleStatusChange = (id: string, newStatus: LeadStatus) => {
    markSingleFluentFormAsRead(id)
    const targetLead = leads.find(l => l.id === id)

    // When status changes to 'converted', automatically sync to Bookings tab & GHL
    if (newStatus === 'converted' && targetLead) {
      // Check if this lead was already booked to avoid duplication
      const alreadyBooked = bookings.some(b =>
        b.notes?.includes(targetLead.id) ||
        (targetLead.entry_id && b.notes?.includes(String(targetLead.entry_id))) ||
        (b.client_phone && targetLead.phone && b.client_phone.replace(/\D/g, '') === targetLead.phone.replace(/\D/g, '') && b.scheduled_date === (targetLead.preferred_date || ''))
      )

      if (!alreadyBooked) {
        const scheduledDate = targetLead.preferred_date || new Date().toISOString().split('T')[0]
        const scheduledTime = targetLead.preferred_time || '09:00 AM'
        const totalAmount   = targetLead.estimated_value || 0 // no invented price
        const serviceType   = targetLead.service || `${targetLead.category} Cleaning`
        const address       = targetLead.address || targetLead.area || 'Dubai'

        const matchedClient = clients.find(c =>
          (targetLead.phone && c.phone && c.phone.replace(/\D/g, '').endsWith(targetLead.phone.replace(/\D/g, '').slice(-8))) ||
          (targetLead.client_name && (c.full_name || '').toLowerCase().trim() === targetLead.client_name.toLowerCase().trim())
        )

        addBooking({
          client_id: matchedClient?.id || '',
          client_name: targetLead.client_name,
          client_phone: targetLead.phone,
          service_address: address,
          service_type: serviceType,
          status: 'confirmed',
          frequency: 'once',
          scheduled_date: scheduledDate,
          scheduled_time: scheduledTime,
          duration_hours: 3,
          assigned_crew: [],
          notes: `Auto-synced from converted Fluent Form lead #${targetLead.entry_id || targetLead.id} (${targetLead.page_source || targetLead.category}). ${targetLead.message || ''}`.trim(),
          total_amount: totalAmount,
          source: 'fluent_forms',
        })

        // Dispatch to GoHighLevel (GHL) confirmation workflow if enabled
        sendGHLBookingConfirmation({
          client_name: targetLead.client_name,
          client_phone: targetLead.phone,
          client_email: targetLead.email,
          service_type: serviceType,
          scheduled_date: scheduledDate,
          scheduled_time: scheduledTime,
          service_address: address,
          total_amount: totalAmount,
          lead_id: targetLead.id,
          notes: targetLead.message,
        }).then(ghlRes => {
          if (ghlRes.success) {
            console.log('[GHL Confirmation Sent]:', ghlRes.message)
          }
        }).catch(err => {
          console.warn('[GHL Notice]:', err)
        })

        triggerToast(`✓ Status set to Converted & automatically synced to Bookings as a confirmed job!`)
      } else {
        triggerToast(`Lead status set to Converted (Already synced in Bookings).`)
      }
    } else {
      triggerToast(`Lead status updated to ${newStatus.toUpperCase()}`)
    }

    // First move out of "new" records the response time (UX-23)
    const patch: Partial<FluentFormLead> = { status: newStatus }
    if (targetLead && targetLead.status === 'new' && newStatus !== 'new' && !targetLead.responded_at) {
      patch.responded_at = new Date().toISOString()
    }
    setLeads(prev => {
      const updated = prev.map(l => l.id === id ? { ...l, ...patch } : l)
      saveLeadsLocally(updated)
      return updated
    })
    void updateFluentFormLead(id, patch)
  }

  // Same phone within 7 days → possible duplicate (UX-24)
  const duplicates = useMemo(() => findDuplicateLeads(leads), [leads])

  // Delete lead
  const handleDeleteLead = async (id: string) => {
    if (!(await confirmAsync({ title: 'Delete lead', message: 'Delete this lead?', confirmLabel: 'Delete', tone: 'danger' }))) return
    setLeads(prev => {
      const updated = prev.filter(l => l.id !== id)
      saveLeadsLocally(updated)
      return updated
    })
    deleteFluentFormLeadRemote(id)
    if (selectedLead?.id === id) setSelectedLead(null)
    triggerToast('Lead deleted')
  }

  // Convert Lead to Booking (Manual modal confirmation)
  const handleConvertBooking = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!convertingLead) return
    const fd = new FormData(e.currentTarget)

    const scheduledDate = (fd.get('scheduled_date') as string) || new Date().toISOString().split('T')[0]
    const scheduledTime = (fd.get('scheduled_time') as string) || '09:00 AM'
    const totalAmount   = Number(fd.get('total_amount')) || convertingLead.estimated_value || 500
    const serviceType   = (fd.get('service_type') as string) || convertingLead.service || `${convertingLead.category} Service`
    const address       = (fd.get('address') as string) || convertingLead.address || convertingLead.area || 'Dubai'

    const matchedClient = clients.find(c =>
      (convertingLead.phone && c.phone && c.phone.replace(/\D/g, '').endsWith(convertingLead.phone.replace(/\D/g, '').slice(-8))) ||
      (convertingLead.client_name && (c.full_name || '').toLowerCase().trim() === convertingLead.client_name.toLowerCase().trim())
    )

    // Add to bookings
    addBooking({
      client_id: matchedClient?.id || '',
      client_name: convertingLead.client_name,
      client_phone: convertingLead.phone,
      service_address: address,
      service_type: serviceType,
      status: 'confirmed',
      frequency: 'once',
      scheduled_date: scheduledDate,
      scheduled_time: scheduledTime,
      duration_hours: 4,
      assigned_crew: [],
      notes: `Converted from Website Fluent Form (${convertingLead.page_source}). Remarks: ${convertingLead.message || 'None'}`,
      total_amount: totalAmount,
      source: 'fluent_forms',
    })

    // Also dispatch to GHL confirmation email workflow if enabled
    sendGHLBookingConfirmation({
      client_name: convertingLead.client_name,
      client_phone: convertingLead.phone,
      client_email: convertingLead.email,
      service_type: serviceType,
      scheduled_date: scheduledDate,
      scheduled_time: scheduledTime,
      service_address: address,
      total_amount: totalAmount,
      lead_id: convertingLead.id,
      notes: convertingLead.message,
    }).catch(() => {})

    // Update lead status to converted
    setLeads(prev => {
      const updated = prev.map(l => l.id === convertingLead.id ? { ...l, status: 'converted' as LeadStatus } : l)
      saveLeadsLocally(updated)
      return updated
    })
    updateFluentFormLeadStatus(convertingLead.id, 'converted')

    setConvertingLead(null)
    triggerToast(`✓ Successfully converted ${convertingLead.client_name} into an official Booking!`)
  }



  // Filtered Leads
  const filteredLeads = useMemo(() => {
    return leads.filter(l => {
      // 1. Search filter
      const q = search.toLowerCase().trim()
      const matchSearch = !q ||
        l.client_name.toLowerCase().includes(q) ||
        l.phone.toLowerCase().includes(q) ||
        l.email.toLowerCase().includes(q) ||
        l.page_source.toLowerCase().includes(q) ||
        l.category.toLowerCase().includes(q) ||
        (l.address && l.address.toLowerCase().includes(q)) ||
        (l.message && l.message.toLowerCase().includes(q))

      // 2. Page filter
      const matchPage = pageFilter === 'ALL' || l.page_source === pageFilter

      // 3. Category filter
      const matchCat = catFilter === 'ALL' || l.category === catFilter

      // 4. Status filter
      const matchStatus = statusFilter === 'ALL' || l.status === statusFilter

      // 5. Date filter (3 days, 7 days, 30 days, 3 months, 6 months, 1 year, custom)
      const leadDate = getLeadLocalDate(l.created_at)
      const curToday = getTodayLocalDate()
      let matchDate = true

      if (datePreset === '3days') {
        matchDate = leadDate >= getDaysAgoLocalDate(2) && leadDate <= curToday
      } else if (datePreset === '7days') {
        matchDate = leadDate >= getDaysAgoLocalDate(6) && leadDate <= curToday
      } else if (datePreset === '30days') {
        matchDate = leadDate >= getDaysAgoLocalDate(29) && leadDate <= curToday
      } else if (datePreset === '3months') {
        const d = new Date()
        d.setMonth(d.getMonth() - 3)
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        matchDate = leadDate >= `${y}-${m}-${day}` && leadDate <= curToday
      } else if (datePreset === '6months') {
        const d = new Date()
        d.setMonth(d.getMonth() - 6)
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        matchDate = leadDate >= `${y}-${m}-${day}` && leadDate <= curToday
      } else if (datePreset === '1year') {
        const d = new Date()
        d.setFullYear(d.getFullYear() - 1)
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        matchDate = leadDate >= `${y}-${m}-${day}` && leadDate <= curToday
      } else if (datePreset === 'custom') {
        if (customStartDate && customEndDate) {
          matchDate = leadDate >= customStartDate && leadDate <= customEndDate
        } else if (customStartDate) {
          matchDate = leadDate >= customStartDate
        } else if (customEndDate) {
          matchDate = leadDate <= customEndDate
        }
      }

      return matchSearch && matchPage && matchCat && matchStatus && matchDate
    })
  }, [leads, search, pageFilter, catFilter, statusFilter, datePreset, customStartDate, customEndDate])

  /* ─── Page Source Performance Analytics ─── */
  const pageAnalytics = useMemo(() => {
    const map = new Map<string, {
      page: string
      url: string
      leadsCount: number
      convertedCount: number
      pipelineValue: number
      topCatMap: Record<string, number>
    }>()

    leads.forEach(l => {
      const p = l.page_source || '/home'
      if (!map.has(p)) {
        map.set(p, {
          page: p,
          url: l.source_url,
          leadsCount: 0,
          convertedCount: 0,
          pipelineValue: 0,
          topCatMap: {},
        })
      }
      const item = map.get(p)!
      item.leadsCount += 1
      if (l.status === 'converted') item.convertedCount += 1
      item.pipelineValue += Number(l.estimated_value) || 0
      item.topCatMap[l.category] = (item.topCatMap[l.category] || 0) + 1
    })

    const list = Array.from(map.values()).map(item => {
      const topCat = Object.entries(item.topCatMap).sort((a, b) => b[1] - a[1])[0]?.[0] || 'General'
      const convRate = item.leadsCount > 0 ? Math.round((item.convertedCount / item.leadsCount) * 100) : 0
      const share = leads.length > 0 ? Math.round((item.leadsCount / leads.length) * 100) : 0
      return {
        ...item,
        topCat,
        convRate,
        share,
      }
    })

    return list.sort((a, b) => b.leadsCount - a.leadsCount)
  }, [leads])

  /* ─── Category Performance Analytics ─── */
  const categoryAnalytics = useMemo(() => {
    const map = new Map<string, { category: string; count: number; converted: number; totalValue: number }>()
    leads.forEach(l => {
      const c = l.category || 'General'
      if (!map.has(c)) {
        map.set(c, { category: c, count: 0, converted: 0, totalValue: 0 })
      }
      const item = map.get(c)!
      item.count += 1
      if (l.status === 'converted') item.converted += 1
      item.totalValue += Number(l.estimated_value) || 0
    })

    return Array.from(map.values())
      .map(item => ({
        ...item,
        convRate: item.count > 0 ? Math.round((item.converted / item.count) * 100) : 0,
        avgTicket: item.count > 0 ? Math.round(item.totalValue / item.count) : 0,
      }))
      .sort((a, b) => b.count - a.count)
  }, [leads])

  // Key KPI summaries
  const todayStr = getTodayLocalDate()
  const yesterdayStr = getDaysAgoLocalDate(1)
  const days7Min = getDaysAgoLocalDate(6)
  const days30Min = getDaysAgoLocalDate(29)
  const days3Min = getDaysAgoLocalDate(2)

  const todayLeads = useMemo(() => {
    return leads.filter(l => getLeadLocalDate(l.created_at) === todayStr)
  }, [leads, todayStr])
  const todayLeadsCount = todayLeads.length
  const todayNewCount = todayLeads.filter(l => l.status === 'new').length

  const yesterdayLeads = useMemo(() => {
    return leads.filter(l => getLeadLocalDate(l.created_at) === yesterdayStr)
  }, [leads, yesterdayStr])
  const yesterdayLeadsCount = yesterdayLeads.length

  const count7Days = useMemo(() => {
    return leads.filter(l => {
      const ld = getLeadLocalDate(l.created_at)
      return ld >= days7Min && ld <= todayStr
    }).length
  }, [leads, days7Min, todayStr])

  const count30Days = useMemo(() => {
    return leads.filter(l => {
      const ld = getLeadLocalDate(l.created_at)
      return ld >= days30Min && ld <= todayStr
    }).length
  }, [leads, days30Min, todayStr])

  const count3Days = useMemo(() => {
    return leads.filter(l => {
      const ld = getLeadLocalDate(l.created_at)
      return ld >= days3Min && ld <= todayStr
    }).length
  }, [leads, days3Min, todayStr])

  const totalLeads = leads.length
  const totalConverted = leads.filter(l => l.status === 'converted').length
  const overallConvRate = totalLeads > 0 ? Math.round((totalConverted / totalLeads) * 100) : 0
  const totalPipeline = leads.reduce((sum, l) => sum + (Number(l.estimated_value) || 0), 0)
  const newLeadsCount = leads.filter(l => l.status === 'new').length
  const bestPage = pageAnalytics[0]
  const topCategory = categoryAnalytics[0]

  // Distinct lists for filter dropdowns
  const distinctPages = useMemo(() => Array.from(new Set(leads.map(l => l.page_source).filter(Boolean))), [leads])
  const distinctCats  = useMemo(() => Array.from(new Set(leads.map(l => l.category).filter(Boolean))), [leads])

  const webhookConfig = getWebhookConfig()

  return (
    <div className="space-y-6 pb-12">

      {/* ── Toast Alert ── */}
      {toastNotice && (
        <div className="fixed top-5 right-5 z-50 bg-[#111827] text-white px-5 py-3.5 rounded-2xl shadow-xl flex items-center gap-3 border border-slate-700 animate-in fade-in slide-in-from-top-4">
          <CheckCircle size={18} className="text-emerald-400" />
          <span className="text-[13px] font-semibold">{toastNotice}</span>
          <button onClick={() => setToastNotice(null)} className="ml-2 text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* ── Single Merged Hero Header ── */}
      <section className="gradient-card rounded-[24px] px-6 sm:px-7 py-5 sm:py-6 text-white shadow-[0_8px_32px_rgba(15,23,42,0.25)] ring-1 ring-black/10 relative overflow-hidden">
        {/* Glow */}
        <div className="absolute right-0 top-0 w-80 h-80 bg-emerald-400/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          {/* Left: Title + White "Live and Connected" Tag + Live Subtitle */}
          <div className="min-w-0">
            {/* Mobile hamburger */}
            <button
              onClick={openMenu}
              className="lg:hidden mb-3 w-9 h-9 rounded-xl flex items-center justify-center bg-white/10 border border-white/10 text-white/80 hover:text-white hover:bg-white/20 transition-colors cursor-pointer"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>

            <div className="flex items-center gap-3 flex-wrap mb-2">
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                Safaeewala Website Leads
              </h1>

              {/* White Tag: Live and Connected */}
              <span className="inline-flex items-center gap-2 px-3 py-1 bg-white text-emerald-900 font-extrabold text-[12px] rounded-full shadow-md border border-white/90">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-600" />
                </span>
                Live and Connected
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-white/80 text-[13px]">
              <span>WordPress Fluent Forms Webhook is actively syncing in real-time from safaeewala.com</span>
              <span className="text-white/40 hidden sm:inline">·</span>
              <span className="text-emerald-300 font-semibold">
                {datePreset === '7days'
                  ? `${count7Days} Inquiries in Last 7 Days`
                  : datePreset === '30days'
                  ? `${count30Days} Inquiries in Last 30 Days`
                  : `${totalLeads} Total Inquiries Analyzed`}
              </span>
              <span className="text-white/40 hidden sm:inline">·</span>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-white/95 bg-white/15 px-2.5 py-0.5 rounded-md border border-white/20">
                Endpoint: 200 OK Listening
              </span>
            </div>
          </div>

          {/* Right: Separated Export, Webhook Setup & Notification Icon */}
          <div className="flex items-center gap-3 shrink-0 flex-wrap">
            {/* 1. Export Button (Renamed from "Export Excel" to "Export") */}
            <button
              type="button"
              onClick={() => exportLeadsToXLSX(filteredLeads)}
              className="h-11 px-4 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-[12.5px] shadow-sm backdrop-blur-md transition-all flex items-center gap-2 cursor-pointer"
              title="Export Filtered Leads to Excel (.xlsx)"
            >
              <FileSpreadsheet size={16} className="text-emerald-300" />
              <span>Export</span>
            </button>

            {/* 2. Webhook Setup CTA Button */}
            <button
              type="button"
              onClick={() => setShowWebhookModal(true)}
              className="h-11 px-4.5 rounded-2xl bg-white text-emerald-800 font-extrabold text-[12.5px] shadow-lg hover:bg-emerald-50 transition-all shrink-0 flex items-center gap-2 cursor-pointer"
            >
              <Send size={14} className="text-emerald-700" />
              <span>Webhook Setup</span>
            </button>

            {/* 3. Notification Icon (Separated & displayed prominently after Webhook Setup) */}
            <button
              type="button"
              onClick={() => triggerToast('Fluent Forms Webhook is actively syncing in real-time · Endpoint: 200 OK Listening')}
              className="relative h-11 w-11 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center text-white/95 shadow-sm backdrop-blur-md transition-all cursor-pointer"
              title="Live Webhook Activity & Notifications"
              aria-label="Notifications"
            >
              <Bell size={18} />
              <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-emerald-400 rounded-full animate-ping" />
              <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-emerald-400 rounded-full" />
            </button>
          </div>
        </div>
      </section>

      {/* ── 5 Performance KPI Cards (Real live metrics) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {[
          {
            label: 'Today Inquiries',
            value: todayLeadsCount,
            sub: todayLeadsCount > 0 ? `${todayNewCount} new unread today` : 'No inquiries yet today',
            icon: Clock,
            iconBg: 'bg-emerald-50',
            iconColor: 'text-emerald-600',
            highlight: 'Today',
          },
          {
            label: 'Yesterday Inquiries',
            value: yesterdayLeadsCount,
            sub: yesterdayLeadsCount > 0 ? `${yesterdayLeadsCount} inquiries yesterday` : 'No inquiries yesterday',
            icon: Calendar,
            iconBg: 'bg-blue-50',
            iconColor: 'text-blue-600',
            highlight: 'Yesterday',
          },
          {
            label: 'Top Category',
            value: topCategory ? topCategory.category : '—',
            sub: topCategory ? `${topCategory.count} inquiries · Top requested` : 'No live data yet',
            icon: BarChart3,
            iconBg: 'bg-purple-50',
            iconColor: 'text-purple-600',
            highlight: topCategory ? 'High Demand' : 'None',
            isSmallText: true,
          },
          {
            label: 'Conversion Rate',
            value: `${overallConvRate}%`,
            sub: `${totalConverted} converted to bookings`,
            icon: CheckCircle,
            iconBg: 'bg-indigo-50',
            iconColor: 'text-indigo-600',
            highlight: totalLeads > 0 ? `${totalConverted} of ${totalLeads}` : '0% Live',
          },
          {
            label: 'Action Required',
            value: newLeadsCount,
            sub: 'Awaiting first phone/WhatsApp call',
            icon: AlertTriangle,
            iconBg: newLeadsCount > 0 ? 'bg-rose-50' : 'bg-slate-50',
            iconColor: newLeadsCount > 0 ? 'text-rose-600' : 'text-slate-500',
            highlight: newLeadsCount > 0 ? 'URGENT' : 'ALL CLEAR',
            urgent: newLeadsCount > 0,
          },
        ].map(card => (
          <div
            key={card.label}
            className={`bg-white rounded-[24px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5 hover:shadow-[0_8px_30px_rgba(15,23,42,0.10)] transition-all ${
              card.urgent ? 'border-rose-200 bg-rose-50/20' : ''
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div className={`w-10 h-10 rounded-2xl ${card.iconBg} flex items-center justify-center shrink-0`}>
                <card.icon size={18} className={card.iconColor} />
              </div>
              <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                card.urgent ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-700'
              }`}>
                {card.highlight}
              </span>
            </div>
            <p className={`font-black text-[#111827] tracking-tight truncate ${card.isSmallText ? 'text-lg' : 'text-2xl'}`} title={String(card.value)}>
              {card.value}
            </p>
            <p className="text-[12px] font-bold text-[#111827] mt-1 truncate">{card.label}</p>
            <p className="text-[11px] text-slate-500 mt-0.5 truncate">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Toolbar & Filters ── */}
      <div className="bg-white rounded-[22px] border border-[#E4E8EC] p-5 shadow-[0_4px_20px_rgba(15,23,42,0.05)] space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search leads by client, phone, email, address, or message…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full text-[13px] pl-10 pr-4 py-2.5 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-indigo-400 focus:bg-white placeholder-slate-400 transition-colors"
            />
          </div>

          {/* Date Range Presets with Live Inquiry Counts */}
          <div className="flex items-center gap-1 bg-[#f8fafc] p-1 rounded-xl border border-[#E4E8EC] flex-wrap">
            {[
              { id: 'all',     label: 'All Time',     count: totalLeads },
              { id: '3days',   label: '3 Days',       count: count3Days },
              { id: '7days',   label: '7 Days',       count: count7Days },
              { id: '30days',  label: '30 Days',      count: count30Days },
              { id: '3months', label: '3 Months' },
              { id: '6months', label: '6 Months' },
              { id: '1year',   label: '1 Year' },
              { id: 'custom',  label: 'Custom Range' },
            ].map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => setDatePreset(p.id as FluentDatePreset)}
                className={`text-[11.5px] font-bold px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                  datePreset === p.id
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <span>{p.label}</span>
                {typeof p.count === 'number' && (
                  <span
                    className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded-full ${
                      datePreset === p.id
                        ? 'bg-white/25 text-white'
                        : 'bg-slate-200/80 text-slate-700'
                    }`}
                  >
                    {p.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Selected Period Inquiries Counter Indicator Banner */}
        {datePreset === '7days' && (
          <div className="flex items-center justify-between bg-indigo-50/90 border border-indigo-200/90 px-4 py-2.5 rounded-xl text-[12.5px] animate-in fade-in">
            <div className="flex items-center gap-2 text-indigo-950 font-bold">
              <Calendar size={15} className="text-indigo-600" />
              <span>Last 7 Days Total Inquiries:</span>
              <span className="px-2.5 py-0.5 rounded-lg bg-indigo-600 text-white font-black text-[13px] shadow-xs">
                {count7Days}
              </span>
              <span className="text-slate-500 font-medium text-[11.5px] hidden sm:inline">
                (Total website inquiries received in the last 7 days)
              </span>
            </div>
            <span className="text-[11.5px] font-bold text-indigo-700">
              Showing {filteredLeads.length} matching table records
            </span>
          </div>
        )}

        {datePreset === '30days' && (
          <div className="flex items-center justify-between bg-indigo-50/90 border border-indigo-200/90 px-4 py-2.5 rounded-xl text-[12.5px] animate-in fade-in">
            <div className="flex items-center gap-2 text-indigo-950 font-bold">
              <Calendar size={15} className="text-indigo-600" />
              <span>Last 30 Days Total Inquiries:</span>
              <span className="px-2.5 py-0.5 rounded-lg bg-indigo-600 text-white font-black text-[13px] shadow-xs">
                {count30Days}
              </span>
              <span className="text-slate-500 font-medium text-[11.5px] hidden sm:inline">
                (Total website inquiries received in the last 30 days)
              </span>
            </div>
            <span className="text-[11.5px] font-bold text-indigo-700">
              Showing {filteredLeads.length} matching table records
            </span>
          </div>
        )}

        {/* Custom Date Range Picker Strip */}
        {datePreset === 'custom' && (
          <div className="flex items-center gap-3 bg-indigo-50/70 border border-indigo-200 p-2.5 rounded-xl text-[12px] flex-wrap animate-in fade-in">
            <span className="font-bold text-indigo-950 flex items-center gap-1.5">
              <Calendar size={14} className="text-indigo-600" />
              <span>Custom Date Range:</span>
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-slate-500">From</span>
              <input
                type="date"
                value={customStartDate}
                onChange={e => setCustomStartDate(e.target.value)}
                className="px-2.5 py-1 rounded-lg border border-[#E4E8EC] bg-white text-slate-800 text-[11.5px] font-semibold focus:outline-none focus:border-indigo-500 shadow-xs cursor-pointer"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-slate-500">To</span>
              <input
                type="date"
                value={customEndDate}
                onChange={e => setCustomEndDate(e.target.value)}
                className="px-2.5 py-1 rounded-lg border border-[#E4E8EC] bg-white text-slate-800 text-[11.5px] font-semibold focus:outline-none focus:border-indigo-500 shadow-xs cursor-pointer"
              />
            </div>
            {(customStartDate || customEndDate) && (
              <button
                type="button"
                onClick={() => { setCustomStartDate(''); setCustomEndDate('') }}
                className="text-[11px] font-bold text-rose-600 hover:text-rose-800 underline ml-2 cursor-pointer"
              >
                Clear Dates
              </button>
            )}
          </div>
        )}

        {/* Dropdowns row */}
        <div className="flex items-center gap-3 flex-wrap pt-2 border-t border-[#edf2f7]">
          {/* Page Source Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-bold text-slate-500 flex items-center gap-1">
              <Globe size={13} /> Page:
            </span>
            <select
              value={pageFilter}
              onChange={e => setPageFilter(e.target.value)}
              className="text-[12px] font-semibold bg-[#f8fafc] border border-[#E4E8EC] rounded-xl px-3 py-1.5 focus:outline-none focus:border-indigo-400"
            >
              <option value="ALL">All Pages ({distinctPages.length})</option>
              {distinctPages.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* Category Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-bold text-slate-500 flex items-center gap-1">
              <Filter size={13} /> Category:
            </span>
            <select
              value={catFilter}
              onChange={e => setCatFilter(e.target.value)}
              className="text-[12px] font-semibold bg-[#f8fafc] border border-[#E4E8EC] rounded-xl px-3 py-1.5 focus:outline-none focus:border-emerald-400"
            >
              <option value="ALL">All Categories ({distinctCats.length})</option>
              {distinctCats.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Status Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-bold text-slate-500">Status:</span>
            <div className="flex items-center gap-1 flex-wrap">
              {['ALL', 'new', 'contacted', 'quoted', 'converted', 'lost'].map(st => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
                    statusFilter === st
                      ? 'bg-[#111827] text-white border-[#111827]'
                      : 'bg-white text-slate-600 border-[#E4E8EC] hover:bg-slate-100'
                  }`}
                >
                  {st === 'ALL' ? 'All' : st.charAt(0).toUpperCase() + st.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {(search || pageFilter !== 'ALL' || catFilter !== 'ALL' || statusFilter !== 'ALL' || datePreset !== 'all' || customStartDate || customEndDate) && (
            <button
              onClick={() => {
                setSearch('')
                setPageFilter('ALL')
                setCatFilter('ALL')
                setStatusFilter('ALL')
                setDatePreset('all')
                setCustomStartDate('')
                setCustomEndDate('')
              }}
              className="text-[11.5px] font-bold text-rose-600 hover:text-rose-800 ml-auto cursor-pointer"
            >
              ✕ Reset All Filters
            </button>
          )}
        </div>
      </div>

      {/* ── Fluent Forms Leads Table ── */}
      <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] relative">
        <div className="px-6 py-4 border-b border-[#E4E8EC] flex items-center justify-between flex-wrap gap-3 rounded-t-[22px]">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-[15px] font-bold text-[#111827]">
                Form Submissions ({filteredLeads.length})
              </h3>
              {datePreset === '7days' && (
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Last 7 Days: {count7Days} Inquiries
                </span>
              )}
              {datePreset === '30days' && (
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Last 30 Days: {count30Days} Inquiries
                </span>
              )}
            </div>
            <p className="text-[12px] text-slate-500 mt-0.5">
              Showing leads sorted chronologically by submission timestamp
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center bg-slate-100 rounded-xl p-0.5" role="group" aria-label="View">
              <button type="button" onClick={() => setBoardView(false)}
                className={`text-[12px] font-bold px-3 py-1 rounded-lg cursor-pointer ${!boardView ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'}`}>Table</button>
              <button type="button" onClick={() => setBoardView(true)}
                className={`text-[12px] font-bold px-3 py-1 rounded-lg cursor-pointer ${boardView ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'}`}>Board</button>
            </div>
            <span className="text-[12px] font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-xl">
              {filteredLeads.length} Inquiries
            </span>

            {/* Customize Columns Toggle Button */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowColMenu(p => !p)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[12px] font-bold transition-all cursor-pointer ${
                  showColMenu
                    ? 'border-indigo-400 bg-indigo-50 text-indigo-900 shadow-xs'
                    : 'border-[#E4E8EC] bg-white text-slate-700 hover:bg-slate-50'
                }`}
                title="Show, hide, and drag-and-drop to reorder table columns"
              >
                <SlidersHorizontal size={13} className="text-slate-500" />
                <span>Columns ({Object.values(visibleCols).filter(Boolean).length})</span>
              </button>

              {showColMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowColMenu(false)} />
                  <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-[#E4E8EC] rounded-2xl shadow-2xl z-50 p-3.5 animate-in fade-in zoom-in-95 max-h-[460px] flex flex-col">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#E4E8EC] shrink-0">
                      <div>
                        <span className="text-[12.5px] font-bold text-slate-800">Customize Columns</span>
                        <p className="text-[10.5px] text-slate-400">Drag & drop or use arrows to reorder</p>
                      </div>
                      <button
                        type="button"
                        onClick={resetColumns}
                        className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
                      >
                        Reset All
                      </button>
                    </div>

                    <div className="space-y-1.5 overflow-y-auto pr-1 flex-1">
                      {colOrder.map((colId, index) => {
                        const colDef = ALL_FLUENT_COLS.find(c => c.id === colId) || { id: colId, label: colId }
                        const isVisible = !!visibleCols[colId]
                        const isDragging = draggedColId === colId
                        const isDragOver = dragOverColId === colId

                        return (
                          <div
                            key={colId}
                            draggable
                            onDragStart={e => handleDragStart(e, colId)}
                            onDragOver={e => handleDragOver(e, colId)}
                            onDrop={e => handleDrop(e, colId)}
                            onDragEnd={handleDragEnd}
                            className={`flex items-center justify-between px-2.5 py-2 rounded-xl border transition-all select-none ${
                              isDragging
                                ? 'opacity-40 border-dashed border-indigo-400 bg-indigo-50/50'
                                : isDragOver
                                ? 'border-indigo-500 bg-indigo-50/80 shadow-xs'
                                : 'border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50/70'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-700 p-0.5 rounded touch-none"
                                title="Drag up or down to reorder"
                              >
                                <GripVertical size={14} />
                              </span>
                              <span className={`text-[12px] truncate ${isVisible ? 'font-semibold text-slate-800' : 'text-slate-400'}`}>
                                {colDef.label}
                              </span>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <div className="flex items-center mr-1">
                                <button
                                  type="button"
                                  disabled={index === 0}
                                  onClick={() => moveColumn(colId, 'up')}
                                  className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20 disabled:hover:text-slate-400 cursor-pointer disabled:cursor-not-allowed rounded hover:bg-slate-100"
                                  title="Move Up"
                                >
                                  <ChevronUp size={13} />
                                </button>
                                <button
                                  type="button"
                                  disabled={index === colOrder.length - 1}
                                  onClick={() => moveColumn(colId, 'down')}
                                  className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20 disabled:hover:text-slate-400 cursor-pointer disabled:cursor-not-allowed rounded hover:bg-slate-100"
                                  title="Move Down"
                                >
                                  <ChevronDown size={13} />
                                </button>
                              </div>

                              <input
                                type="checkbox"
                                checked={isVisible}
                                onChange={() => toggleColumn(colId)}
                                className="w-4 h-4 rounded accent-indigo-600 cursor-pointer"
                                title={isVisible ? 'Hide Column' : 'Show Column'}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    <div className="mt-2.5 pt-2 border-t border-[#E4E8EC] text-[10.5px] text-slate-400 text-center shrink-0">
                      Drag grip handle or click arrows to reorder • Auto-saved
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {filteredLeads.length === 0 ? (
          <div className="py-16 text-center">
            <Globe className="mx-auto mb-3 text-slate-300" size={42} strokeWidth={1.25} />
            <p className="text-[15px] font-bold text-slate-700">
              {leads.length === 0 ? 'No Website Form Leads Yet' : 'No Form Leads Match Current Filters'}
            </p>
            <p className="text-[12px] text-slate-400 mt-1 max-w-md mx-auto">
              {leads.length === 0
                ? 'Webhook endpoint is active and listening. Live inquiries submitted on safaeewala.com will appear here in real-time.'
                : 'Try adjusting or clearing your date range, page, or category filters.'}
            </p>
          </div>
        ) : boardView ? (
          <LeadsKanban leads={filteredLeads} duplicates={duplicates} onMove={handleStatusChange} onOpen={setSelectedLead} />
        ) : (
          <div className="overflow-x-auto rounded-b-[22px]">
            <table className="w-full text-left border-collapse text-[12px]">
              <thead className="bg-[#f8fafc] border-b border-[#E4E8EC] text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                <tr>
                  {colOrder.map(colId => {
                    if (!visibleCols[colId]) return null
                    switch (colId) {
                      case 'submitted_at':
                        return <th key={colId} className="py-3 px-4 whitespace-nowrap">Submitted At</th>
                      case 'client_name':
                        return <th key={colId} className="py-3 px-4 whitespace-nowrap">Client</th>
                      case 'contact':
                        return <th key={colId} className="py-3 px-3 min-w-[150px]">Contact</th>
                      case 'service_needed':
                        return <th key={colId} className="py-3 px-3">Service Needed</th>
                      case 'property_type':
                        return <th key={colId} className="py-3 px-3">Property Type</th>
                      case 'area_location':
                        return <th key={colId} className="py-3 px-3">Area / Location</th>
                      case 'preferred_date':
                        return (
                          <th key={colId} className="py-3 px-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <Calendar size={12} className="text-indigo-500" />
                              <span>Preferred Date</span>
                            </div>
                          </th>
                        )
                      case 'page_source':
                        return <th key={colId} className="py-3 px-3">Page Source</th>
                      case 'status':
                        return <th key={colId} className="py-3 px-3 text-center">Status</th>
                      case 'actions':
                        return <th key={colId} className="py-3 px-4 text-right">Actions</th>
                      default:
                        return null
                    }
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E8EC]">
                {filteredLeads.map(lead => {
                  const catCfg = categoryColors[lead.category] || { bg: 'bg-slate-50', text: 'text-slate-700' }
                  const stCfg = statusBadgeConfig[lead.status] || statusBadgeConfig.new
                  const waNumber = (lead.whatsapp || lead.phone || '').replace(/[^0-9]/g, '')
                  const rawPref = resolvePreferredDate(lead)

                  return (
                    <tr key={lead.id} className="hover:bg-indigo-50/20 transition-colors">
                      {colOrder.map(colId => {
                        if (!visibleCols[colId]) return null

                        switch (colId) {
                          case 'submitted_at':
                            return (
                              <td key={colId} className="py-3 px-4 whitespace-nowrap">
                                <p className="font-bold text-slate-800">{formatDate(lead.created_at)}</p>
                                <p className="text-[10.5px] text-slate-400 mt-0.5">
                                  {new Date(lead.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </td>
                            )

                          case 'client_name':
                            return (
                              <td key={colId} className="py-3 px-4 min-w-[140px]">
                                <p className="font-bold text-[#111827]">{lead.client_name || 'Guest Client'}</p>
                                {duplicates.get(lead.id) && (
                                  <span className="inline-block mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200"
                                    title={`Same phone as ${duplicates.get(lead.id)!.client_name} on ${duplicates.get(lead.id)!.created_at?.split('T')[0]}`}>
                                    Possible duplicate
                                  </span>
                                )}
                              </td>
                            )

                          case 'contact':
                            return (
                              <td key={colId} className="py-3 px-3 min-w-[140px]">
                                <a
                                  href={`tel:${lead.phone}`}
                                  className="inline-flex items-center gap-1.5 text-[11px] text-slate-700 hover:text-emerald-700 font-semibold"
                                  title="Call client"
                                >
                                  <Phone size={11} className="text-slate-400" /> {lead.phone}
                                </a>
                                {lead.email && (
                                  <p className="text-[10.5px] text-slate-400 truncate max-w-[180px] mt-0.5">{lead.email}</p>
                                )}
                              </td>
                            )

                          case 'service_needed':
                            return (
                              <td key={colId} className="py-3 px-3 min-w-[150px]">
                                <p className="font-bold text-[#111827] text-[12px]" title={lead.service || `${lead.category} Cleaning`}>
                                  {lead.service || `${lead.category} Cleaning`}
                                </p>
                              </td>
                            )

                          case 'property_type': {
                            const pType = resolvePropertyType(lead)
                            const propStyles: Record<string, string> = {
                              Villa: 'bg-emerald-50 text-emerald-800 border-emerald-200',
                              House: 'bg-emerald-50 text-emerald-800 border-emerald-200',
                              Townhouse: 'bg-amber-50 text-amber-800 border-amber-200',
                              Apartment: 'bg-sky-50 text-sky-800 border-sky-200',
                              Office: 'bg-purple-50 text-purple-800 border-purple-200',
                              Penthouse: 'bg-indigo-50 text-indigo-800 border-indigo-200',
                              Studio: 'bg-cyan-50 text-cyan-800 border-cyan-200',
                              'Not Specified': 'bg-slate-100 text-slate-500 border-slate-200',
                            }
                            const badgeClass = propStyles[pType] || 'bg-slate-100 text-slate-700 border-slate-200'
                            return (
                              <td key={colId} className="py-3 px-3 whitespace-nowrap">
                                <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-xl border ${badgeClass}`}>
                                  <Building size={11} /> {pType}
                                </span>
                              </td>
                            )
                          }

                          case 'area_location':
                            return (
                              <td key={colId} className="py-3 px-3 min-w-[140px]">
                                <p className="font-bold text-[#111827] text-[12px]">
                                  {lead.area || 'Dubai'}
                                </p>
                                {lead.address && lead.address !== lead.area && (
                                  <p className="text-[10.5px] text-slate-500 truncate max-w-[180px] mt-0.5" title={lead.address}>
                                    {lead.address}
                                  </p>
                                )}
                              </td>
                            )

                          case 'preferred_date':
                            return (
                              <td key={colId} className="py-3 px-3 whitespace-nowrap">
                                {rawPref ? (
                                  <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 shrink-0">
                                      <Calendar size={13} />
                                    </div>
                                    <div>
                                      <p className="font-bold text-[#111827] text-[12px]">
                                        {formatDate(rawPref)}
                                      </p>
                                      {lead.preferred_time ? (
                                        <p className="text-[10.5px] text-indigo-600 font-semibold mt-0.5">
                                          {lead.preferred_time}
                                        </p>
                                      ) : (
                                        <p className="text-[10px] text-slate-400 mt-0.5">
                                          {rawPref.includes('T') ? rawPref.split('T')[0] : rawPref}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-[11px] text-slate-400 italic">—</span>
                                )}
                              </td>
                            )

                          case 'page_source':
                            return (
                              <td key={colId} className="py-3 px-3 min-w-[140px] max-w-[180px]">
                                <a
                                  href={lead.source_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-[11.5px] font-bold text-indigo-700 hover:text-indigo-900 truncate"
                                  title={lead.source_url}
                                >
                                  <Globe size={11} className="shrink-0" />
                                  <span className="truncate">{lead.page_source}</span>
                                  <ExternalLink size={10} className="shrink-0 text-indigo-400" />
                                </a>
                                <p className="text-[10px] text-slate-400 truncate mt-0.5">{lead.form_title}</p>
                              </td>
                            )

                          case 'status':
                            return (
                              <td key={colId} className="py-3 px-3 text-center whitespace-nowrap">
                                <select
                                  value={lead.status}
                                  onChange={e => handleStatusChange(lead.id, e.target.value as LeadStatus)}
                                  className={`text-[11px] font-bold px-2.5 py-1 rounded-full border cursor-pointer focus:outline-none ${stCfg.bg} ${stCfg.text} ${stCfg.border}`}
                                >
                                  <option value="new">New Lead</option>
                                  <option value="contacted">Contacted</option>
                                  <option value="quoted">Quoted</option>
                                  <option value="converted">Converted</option>
                                  <option value="lost">Lost</option>
                                </select>
                              </td>
                            )

                          case 'actions':
                            return (
                              <td key={colId} className="py-3 px-4 text-right whitespace-nowrap">
                                <div className="flex items-center justify-end gap-1.5">
                                  {lead.status !== 'converted' ? (
                                    <button
                                      onClick={() => setConvertingLead(lead)}
                                      className="inline-flex items-center gap-1 text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1.5 rounded-xl shadow-xs transition-colors cursor-pointer"
                                      title="Confirmation: Convert inquiry to official Booking"
                                    >
                                      <Plus size={12} /> Confirmation
                                    </button>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg">
                                      <CheckCircle size={12} /> Booked
                                    </span>
                                  )}

                                  <button
                                    onClick={() => {
                                      setSelectedLead(lead)
                                      setIsEditingLead(false)
                                      markSingleFluentFormAsRead(lead.id)
                                    }}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                                    title="View full lead submission payload"
                                  >
                                    <Eye size={13} />
                                  </button>

                                  <button
                                    onClick={() => handleDeleteLead(lead.id)}
                                    className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                                    title="Delete lead"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </td>
                            )

                          default:
                            return null
                        }
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

{/* ── Analytics Visual Section: Page Source vs Category ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* 1. Page Source Performance */}
        <div className="bg-white rounded-[22px] border border-[#E4E8EC] p-6 shadow-[0_4px_20px_rgba(15,23,42,0.05)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Globe size={16} className="text-indigo-600" />
                <h3 className="text-[15px] font-bold text-[#111827]">Page Source Performance</h3>
              </div>
              <span className="text-[11px] font-semibold text-slate-400">Website Traffic Drivers</span>
            </div>
            <p className="text-[12px] text-slate-500 mb-4">
              Shows which landing pages generate the highest volume and best conversion rates.
            </p>

            {pageAnalytics.length === 0 ? (
              <div className="py-8 px-4 text-center bg-[#f8fafc] rounded-xl border border-dashed border-slate-200">
                <Globe className="mx-auto mb-2 text-slate-300" size={26} />
                <p className="text-[13px] font-bold text-slate-600">No Page Source Inquiries Yet</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Real landing page metrics will appear as website visitors submit forms on safaeewala.com</p>
              </div>
            ) : (
            <div className="space-y-3">
              {pageAnalytics.slice(0, 5).map(pa => (
                <div
                  key={pa.page}
                  onClick={() => setPageFilter(pageFilter === pa.page ? 'ALL' : pa.page)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer ${
                    pageFilter === pa.page
                      ? 'border-indigo-400 bg-indigo-50/50 shadow-xs'
                      : 'border-[#edf2f7] bg-[#f8fafc] hover:bg-slate-100/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 truncate">
                      <span className="font-bold text-[13px] text-slate-800 truncate">{pa.page}</span>
                      <span className="text-[10px] font-bold bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full border border-purple-200 shrink-0">
                        Top: {pa.topCat}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[12px] font-extrabold text-indigo-700">{pa.leadsCount} leads</span>
                      <span className="text-[11px] text-slate-400">({pa.share}%)</span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden mb-1.5">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
                      style={{ width: `${pa.share}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>Conv. Rate: <strong className="text-emerald-700">{pa.convRate}%</strong> ({pa.convertedCount} bookings)</span>
                    <span>Value: <strong className="text-slate-700">AED {pa.pipelineValue.toLocaleString()}</strong></span>
                  </div>
                </div>
              ))}
            </div>
            )}
          </div>

          {pageFilter !== 'ALL' && (
            <div className="mt-4 pt-3 border-t border-[#edf2f7] flex items-center justify-between text-[12px]">
              <span className="text-indigo-700 font-semibold">Filtering table by page: <strong>{pageFilter}</strong></span>
              <button
                onClick={() => setPageFilter('ALL')}
                className="text-slate-500 hover:text-slate-800 font-bold underline"
              >
                Clear Filter
              </button>
            </div>
          )}
        </div>

        {/* 2. Category Breakdown */}
        <div className="bg-white rounded-[22px] border border-[#E4E8EC] p-6 shadow-[0_4px_20px_rgba(15,23,42,0.05)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <BarChart3 size={16} className="text-emerald-600" />
                <h3 className="text-[15px] font-bold text-[#111827]">Category & Service Performance</h3>
              </div>
              <span className="text-[11px] font-semibold text-slate-400">Service Popularity</span>
            </div>
            <p className="text-[12px] text-slate-500 mb-4">
              Breakdown of demand, average quote size, and booking conversion by service category.
            </p>

            {categoryAnalytics.length === 0 ? (
              <div className="py-8 px-4 text-center bg-[#f8fafc] rounded-xl border border-dashed border-slate-200">
                <BarChart3 className="mx-auto mb-2 text-slate-300" size={26} />
                <p className="text-[13px] font-bold text-slate-600">No Category Inquiries Yet</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Real service category breakdowns will populate automatically upon form submissions</p>
              </div>
            ) : (
            <div className="space-y-3">
              {categoryAnalytics.map(ca => {
                const colors = categoryColors[ca.category] || { bg: 'bg-slate-50', text: 'text-slate-700' }
                return (
                  <div
                    key={ca.category}
                    onClick={() => setCatFilter(catFilter === ca.category ? 'ALL' : ca.category)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer ${
                      catFilter === ca.category
                        ? 'border-emerald-400 bg-emerald-50/50 shadow-xs'
                        : 'border-[#edf2f7] bg-[#f8fafc] hover:bg-slate-100/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className={`text-[12px] font-bold px-2 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>
                          {ca.category}
                        </span>
                      </div>
                      <span className="text-[12px] font-extrabold text-[#111827]">
                        {ca.count} Inquiries
                      </span>
                    </div>

                    <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden mb-1.5">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{ width: `${Math.round((ca.count / (totalLeads || 1)) * 100)}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>Conv. Rate: <strong className="text-emerald-700">{ca.convRate}%</strong> ({ca.converted} bookings)</span>
                      <span>Avg Ticket: <strong className="text-slate-700">AED {ca.avgTicket}</strong> · Total: <strong>AED {ca.totalValue.toLocaleString()}</strong></span>
                    </div>
                  </div>
                )
              })}
            </div>
            )}
          </div>

          {catFilter !== 'ALL' && (
            <div className="mt-4 pt-3 border-t border-[#edf2f7] flex items-center justify-between text-[12px]">
              <span className="text-emerald-700 font-semibold">Filtering table by category: <strong>{catFilter}</strong></span>
              <button
                onClick={() => setCatFilter('ALL')}
                className="text-slate-500 hover:text-slate-800 font-bold underline"
              >
                Clear Filter
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Modal 1: Webhook Setup & Documentation ── */}
      <Modal
        open={showWebhookModal}
        onClose={() => setShowWebhookModal(false)}
        title="WordPress Fluent Forms Webhook Configuration"
        size="lg"
      >
        <div className="space-y-5">
          {/* Why Error 1006 happened & Resolution */}
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200">
            <h4 className="text-[13.5px] font-bold text-emerald-950 flex items-center gap-2 mb-1">
              <CheckCircle size={16} className="text-emerald-600" />
              Direct Live VPS Webhook Endpoint (No DNS Error 1006)
            </h4>
            <p className="text-[12px] text-emerald-900 leading-relaxed">
              Previously, ReqBin returned <em>&quot;Could not resolve the host name. Error code: 1006&quot;</em> because the previous instructions contained a sample placeholder domain (<code>your-project.supabase.co</code>).
              We have now created a <strong>built-in dedicated Webhook Engine</strong> directly on your live VPS. It requires <strong>no authentication headers</strong> and processes submissions instantly!
            </p>
          </div>

          <div>
            <label className="text-[12px] font-bold text-slate-700 block mb-1">Live Webhook Endpoint URL (POST)</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={webhookConfig.restEndpoint}
                className="flex-1 text-[12.5px] font-mono p-2.5 bg-slate-50 border border-[#E4E8EC] rounded-xl text-slate-900 select-all font-bold"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(webhookConfig.restEndpoint)
                  setCopiedUrl(true)
                  setTimeout(() => setCopiedUrl(false), 2000)
                }}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-[12px] font-bold hover:bg-emerald-700 transition-colors cursor-pointer shrink-0 shadow-sm"
              >
                {copiedUrl ? <Check size={14} className="text-white" /> : <Copy size={14} />}
                {copiedUrl ? 'Copied!' : 'Copy Live URL'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <div className="p-3 bg-slate-50 rounded-xl border border-[#edf2f7]">
              <span className="text-slate-400 font-bold block text-[10px] uppercase">HTTP Request Method</span>
              <strong className="text-[#111827] text-[13px]">POST</strong>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-[#edf2f7]">
              <span className="text-slate-400 font-bold block text-[10px] uppercase">Request Format</span>
              <strong className="text-[#111827] text-[13px]">JSON or Form-Data (Auto-detected)</strong>
            </div>
          </div>

          {/* Form Fields matching the screenshot */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[12px] font-bold text-slate-700">Form Field Mappings (Matches Your Website Form)</label>
              <span className="text-[11px] font-medium text-slate-500">Form ID: [fluentform id=&#39;40&#39;]</span>
            </div>
            <div className="border border-[#E4E8EC] rounded-xl overflow-hidden text-[11.5px]">
              <table className="w-full text-left">
                <thead className="bg-[#f8fafc] text-slate-700 font-bold border-b border-[#E4E8EC]">
                  <tr>
                    <th className="py-2 px-3">Form Label (Screenshot)</th>
                    <th className="py-2 px-3">Fluent Form Parameter</th>
                    <th className="py-2 px-3">Saved in CRM As</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf2f7] text-slate-700">
                  <tr>
                    <td className="py-2 px-3 font-semibold text-slate-900">Your Name *</td>
                    <td className="py-2 px-3 font-mono text-indigo-700 font-bold">{'{inputs.your_name}'} / {'{inputs.names}'}</td>
                    <td className="py-2 px-3 font-medium text-emerald-800">Client Name</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-semibold text-slate-900">Phone / Whatsapp *</td>
                    <td className="py-2 px-3 font-mono text-indigo-700 font-bold">{'{inputs.phone_whatsapp}'} / {'{inputs.phone}'}</td>
                    <td className="py-2 px-3 font-medium text-emerald-800">Phone & WhatsApp</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-semibold text-slate-900">Service Needed</td>
                    <td className="py-2 px-3 font-mono text-indigo-700 font-bold">{'{inputs.service_needed}'}</td>
                    <td className="py-2 px-3 font-medium text-emerald-800">Service Category & Type</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-semibold text-slate-900">Property Type</td>
                    <td className="py-2 px-3 font-mono text-indigo-700 font-bold">{'{inputs.property_type}'}</td>
                    <td className="py-2 px-3 font-medium text-emerald-800">Property Type (Apartment, Villa, etc.)</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-semibold text-slate-900">Area / Location</td>
                    <td className="py-2 px-3 font-mono text-indigo-700 font-bold">{'{inputs.area_location}'}</td>
                    <td className="py-2 px-3 font-medium text-emerald-800">Area / Address</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-semibold text-slate-900">Preferred Date</td>
                    <td className="py-2 px-3 font-mono text-indigo-700 font-bold">{'{inputs.preferred_date}'}</td>
                    <td className="py-2 px-3 font-medium text-emerald-800">Preferred Booking Date</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* cURL Command matching Screenshot 1 & 2 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[12px] font-bold text-slate-700">Test cURL Command (Ready for ReqBin or Terminal)</label>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(webhookConfig.sampleCurl)
                  setCopiedCurl(true)
                  setTimeout(() => setCopiedCurl(false), 2000)
                }}
                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
              >
                {copiedCurl ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                {copiedCurl ? 'Copied' : 'Copy cURL'}
              </button>
            </div>
            <pre className="text-[11px] font-mono p-3 bg-slate-900 text-slate-100 rounded-xl overflow-x-auto leading-relaxed">
              {webhookConfig.sampleCurl}
            </pre>
          </div>

          {/* Test Trigger Button */}
          <div className="flex items-center justify-between pt-2 border-t border-[#E4E8EC]">
            <Button
              type="button"
              onClick={handleSendTestLead}
              disabled={testingWebhook}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center gap-2 text-[12px] py-2 px-4 rounded-xl cursor-pointer"
            >
              <Send size={14} className={testingWebhook ? 'animate-spin' : ''} />
              {testingWebhook ? 'Submitting Test Lead...' : 'Send Live Test Lead Now'}
            </Button>
            <Button onClick={() => setShowWebhookModal(false)}>Close Guide</Button>
          </div>
        </div>
      </Modal>



      {/* ── Modal 3: Lead Confirmation & Booking Creation ── */}
      <Modal
        open={!!convertingLead}
        onClose={() => setConvertingLead(null)}
        title="Lead Confirmation: Create Official Booking"
        size="lg"
      >
        {convertingLead && (
          <form onSubmit={handleConvertBooking} className="space-y-4">
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-[12.5px] leading-relaxed">
              Confirming lead for <strong>{convertingLead.client_name}</strong> from <strong>{convertingLead.page_source}</strong>. This will automatically create an official Booking in your calendar and register the client.
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Client Name"
                name="client_name"
                defaultValue={convertingLead.client_name}
                required
              />
              <Input
                label="Phone Number"
                name="phone"
                defaultValue={convertingLead.phone}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Service Address / Area"
                name="address"
                defaultValue={convertingLead.address || convertingLead.area || 'Dubai'}
                required
              />
              <Input
                label="Service Type"
                name="service_type"
                defaultValue={convertingLead.service || `${convertingLead.category} Service`}
                required
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <Input
                label="Scheduled Date"
                name="scheduled_date"
                type="date"
                defaultValue={convertingLead.preferred_date || new Date().toISOString().split('T')[0]}
                required
              />
              <Input
                label="Scheduled Time"
                name="scheduled_time"
                defaultValue={convertingLead.preferred_time || '09:00 AM'}
              />
              <Input
                label="Booking Amount (AED)"
                name="total_amount"
                type="number"
                defaultValue={convertingLead.estimated_value || 500}
                required
              />
            </div>

            <Textarea
              label="Booking Notes & Instructions"
              name="notes"
              defaultValue={convertingLead.message || `Website inquiry from ${convertingLead.page_source}`}
              rows={2}
            />

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setConvertingLead(null)}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-700">
                Confirm & Create Booking
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* ── Modal 4: View & Edit Lead Details ── */}
      <Modal
        open={!!selectedLead}
        onClose={() => {
          setSelectedLead(null)
          setIsEditingLead(false)
        }}
        title={isEditingLead ? "Edit Form Submission" : "Form Submission Details"}
        size="lg"
      >
        {selectedLead && (
          isEditingLead ? (
            <form onSubmit={handleSaveLeadEdit} className="space-y-4 text-[13px]">
              <div className="p-3 bg-indigo-50/80 border border-indigo-200 rounded-xl text-indigo-950 text-[12px] flex items-center justify-between">
                <span>Modifying submission details for <strong>{selectedLead.client_name}</strong> (Form #{selectedLead.form_id || 40}{selectedLead.entry_id ? ` · Entry #${selectedLead.entry_id}` : ''}).</span>
                <span className="text-[11px] font-semibold text-indigo-600 bg-white/80 px-2 py-0.5 rounded border border-indigo-200">
                  Auto-syncs to CRM
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Input
                  label="Client Name"
                  name="client_name"
                  defaultValue={selectedLead.client_name}
                  required
                />
                <Input
                  label="Phone / WhatsApp"
                  name="phone"
                  defaultValue={selectedLead.phone}
                  required
                />
                <Input
                  label="Email"
                  name="email"
                  type="email"
                  defaultValue={selectedLead.email || ''}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Service Needed"
                  name="service"
                  defaultValue={selectedLead.service || `${selectedLead.category} Cleaning`}
                  required
                />
                <div>
                  <label className="block text-[12px] font-bold text-slate-700 mb-1">
                    Property Type
                  </label>
                  <select
                    name="property_type"
                    defaultValue={selectedLead.property_type || resolvePropertyType(selectedLead)}
                    className="w-full text-[13px] px-3 py-2 bg-white border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-indigo-500 font-medium"
                  >
                    <option value="Apartment">Apartment</option>
                    <option value="Villa">Villa</option>
                    <option value="House">House</option>
                    <option value="Townhouse">Townhouse</option>
                    <option value="Penthouse">Penthouse</option>
                    <option value="Studio">Studio</option>
                    <option value="Office">Office</option>
                    <option value="Not Specified">Not Specified</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Area / Location"
                  name="area"
                  defaultValue={selectedLead.area || 'Dubai'}
                />
                <Input
                  label="Full Service Address"
                  name="address"
                  defaultValue={selectedLead.address || selectedLead.area || 'Dubai'}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Input
                  label="Preferred Date"
                  name="preferred_date"
                  type="date"
                  defaultValue={selectedLead.preferred_date || ''}
                />
                <Input
                  label="Preferred Time"
                  name="preferred_time"
                  defaultValue={selectedLead.preferred_time || '09:00 AM'}
                />
                <Input
                  label="Estimated Value (AED)"
                  name="estimated_value"
                  type="number"
                  defaultValue={selectedLead.estimated_value || 0}
                />
              </div>

              <div>
                <label className="block text-[12px] font-bold text-slate-700 mb-1">
                  Lead Status
                </label>
                <select
                  name="status"
                  defaultValue={selectedLead.status}
                  className="w-full text-[13px] px-3 py-2 bg-white border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-indigo-500 font-semibold"
                >
                  <option value="new">New Lead</option>
                  <option value="contacted">Contacted</option>
                  <option value="quoted">Quoted</option>
                  <option value="converted">Converted (Auto-syncs to Bookings)</option>
                  <option value="lost">Lost</option>
                </select>
              </div>

              <Textarea
                label="Message / Requirements"
                name="message"
                defaultValue={selectedLead.message || ''}
                rows={3}
              />

              <div className="flex gap-3 pt-3 border-t border-[#E4E8EC]">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setIsEditingLead(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                >
                  <Save size={14} className="mr-1.5" />
                  Save Changes
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-4 text-[13px]">
              <div className="flex items-center justify-between pb-3 border-b border-[#E4E8EC]">
                <div>
                  <h4 className="text-[17px] font-bold text-[#111827]">{selectedLead.client_name}</h4>
                  <p className="text-[12px] text-slate-500 mt-0.5">
                    Submitted on {formatDate(selectedLead.created_at)} at {new Date(selectedLead.created_at).toLocaleTimeString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-bold px-3 py-1 rounded-full border ${statusBadgeConfig[selectedLead.status]?.bg} ${statusBadgeConfig[selectedLead.status]?.text} ${statusBadgeConfig[selectedLead.status]?.border}`}>
                    {statusBadgeConfig[selectedLead.status]?.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsEditingLead(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold text-[12px] border border-indigo-200 transition-all cursor-pointer"
                    title="Edit Submission Details"
                  >
                    <Pencil size={13} />
                    <span>Edit</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-[#edf2f7]">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Phone / WhatsApp</span>
                  <a href={`tel:${selectedLead.phone}`} className="font-bold text-[#111827] hover:text-emerald-700">
                    {selectedLead.phone}
                  </a>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-[#edf2f7]">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Service Needed</span>
                  <p className="font-bold text-[#111827] truncate">{selectedLead.service || `${selectedLead.category} Cleaning`}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-[#edf2f7]">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Property Type</span>
                  <p className="font-bold text-emerald-800">{resolvePropertyType(selectedLead)}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-[#edf2f7]">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Area / Location</span>
                  <p className="font-bold text-[#111827] truncate">{selectedLead.area || selectedLead.address || 'Dubai'}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-[#edf2f7]">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Page Source</span>
                  <p className="font-bold text-indigo-700 truncate">{selectedLead.page_source}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-[#edf2f7]">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Form & Entry ID</span>
                  <p className="font-bold text-slate-700 truncate">Form #{selectedLead.form_id || 40} {selectedLead.entry_id ? `· Entry #${selectedLead.entry_id}` : ''}</p>
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-[#edf2f7]">
                <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Message / Requirements</span>
                <p className="text-slate-800 leading-relaxed whitespace-pre-wrap">
                  {selectedLead.message || 'No additional message was provided by client.'}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3 text-[12px]">
                <div className="p-3 bg-slate-50 rounded-xl border border-[#edf2f7]">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Address</span>
                  <strong className="text-slate-800">{selectedLead.address || selectedLead.area || 'Dubai'}</strong>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-[#edf2f7]">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Preferred Date</span>
                  <strong className="text-slate-800">{selectedLead.preferred_date || 'Flexible'}</strong>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-[#edf2f7]">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Estimated Value</span>
                  <strong className="text-emerald-700 text-[14px]">AED {selectedLead.estimated_value || 0}</strong>
                </div>
              </div>

              <div className="flex gap-3 pt-3 border-t border-[#E4E8EC]">
                <Button variant="outline" className="flex-1" onClick={() => setSelectedLead(null)}>
                  Close
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-bold"
                  onClick={() => setIsEditingLead(true)}
                >
                  <Pencil size={14} className="mr-1.5 text-indigo-600" />
                  Edit Submission
                </Button>
                {selectedLead.status !== 'converted' && (
                  <Button
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => {
                      const l = selectedLead
                      setSelectedLead(null)
                      setConvertingLead(l)
                    }}
                  >
                    Convert to Booking
                  </Button>
                )}
              </div>
            </div>
          )
        )}
      </Modal>

    </div>
  )
}
