import { useState, useEffect, useMemo } from 'react'
import {
  Globe, Send, Search, Filter, ExternalLink, Calendar, Phone,
  Mail, MessageSquare, CheckCircle, Clock, AlertTriangle, ArrowUpRight,
  TrendingUp, BarChart3, Plus, Trash2, Eye, Copy, Check, RefreshCw,
  FileSpreadsheet, Sparkles, Building, ChevronRight, X
} from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { formatDate } from '@/lib/utils'
import { useData } from '@/store/DataContext'
import type { FluentFormLead, LeadStatus } from '@/types'
import {
  fetchFluentFormLeads,
  saveLeadsLocally,
  insertFluentFormLead,
  updateFluentFormLeadStatus,
  deleteFluentFormLeadRemote,
  exportLeadsToXLSX,
  getWebhookConfig,
  parseFluentFormWebhook,
  DEFAULT_FLUENT_FORM_LEADS
} from '@/lib/fluentFormsSync'

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

export function FluentFormsLeads() {
  const { addBooking } = useData()

  const [leads, setLeads]               = useState<FluentFormLead[]>([])
  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')
  const [pageFilter, setPageFilter]     = useState('ALL')
  const [catFilter, setCatFilter]       = useState('ALL')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [datePreset, setDatePreset]     = useState<'all' | 'today' | '7days' | '30days'>('all')

  // Modals state
  const [showWebhookModal, setShowWebhookModal] = useState(false)
  const [showSimulateModal, setShowSimulateModal] = useState(false)
  const [selectedLead, setSelectedLead]         = useState<FluentFormLead | null>(null)
  const [convertingLead, setConvertingLead]     = useState<FluentFormLead | null>(null)
  const [copiedUrl, setCopiedUrl]               = useState(false)
  const [copiedCurl, setCopiedCurl]             = useState(false)
  const [toastNotice, setToastNotice]           = useState<string | null>(null)

  // Load leads on mount
  useEffect(() => {
    let mounted = true
    fetchFluentFormLeads().then(data => {
      if (mounted) {
        setLeads(data)
        setLoading(false)
      }
    })
    return () => { mounted = false }
  }, [])

  // Show toast notification
  const triggerToast = (msg: string) => {
    setToastNotice(msg)
    setTimeout(() => setToastNotice(null), 4000)
  }

  // Update lead status
  const handleStatusChange = (id: string, newStatus: LeadStatus) => {
    setLeads(prev => {
      const updated = prev.map(l => l.id === id ? { ...l, status: newStatus } : l)
      saveLeadsLocally(updated)
      return updated
    })
    updateFluentFormLeadStatus(id, newStatus)
    triggerToast(`Lead status updated to ${newStatus.toUpperCase()}`)
  }

  // Delete lead
  const handleDeleteLead = (id: string) => {
    if (!confirm('Are you sure you want to delete this lead?')) return
    setLeads(prev => {
      const updated = prev.filter(l => l.id !== id)
      saveLeadsLocally(updated)
      return updated
    })
    deleteFluentFormLeadRemote(id)
    if (selectedLead?.id === id) setSelectedLead(null)
    triggerToast('Lead deleted')
  }

  // Convert Lead to Booking
  const handleConvertBooking = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!convertingLead) return
    const fd = new FormData(e.currentTarget)

    const scheduledDate = (fd.get('scheduled_date') as string) || new Date().toISOString().split('T')[0]
    const scheduledTime = (fd.get('scheduled_time') as string) || '09:00 AM'
    const totalAmount   = Number(fd.get('total_amount')) || convertingLead.estimated_value || 500
    const serviceType   = (fd.get('service_type') as string) || convertingLead.service || `${convertingLead.category} Service`
    const address       = (fd.get('address') as string) || convertingLead.address || convertingLead.area || 'Dubai'

    // Add to bookings
    addBooking({
      client_id: '',
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
    })

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

  // Simulate new incoming webhook from WordPress Fluent Forms
  const handleSimulateWebhook = (preset: 'deep' | 'villa' | 'movein' | 'sofa') => {
    const presets: Record<string, any> = {
      deep: {
        form_title: 'Deep Cleaning Quick Quote Form',
        source_url: 'https://safaeewala.com/services/deep-cleaning',
        full_name: 'Hamza Tariq',
        phone: '+971 50 719 3321',
        email: 'hamza.tariq@gmail.com',
        category: 'Deep Cleaning',
        service: '3 Bedroom Apartment Deep Cleaning',
        address: 'Tower B, Downtown Views, Downtown Dubai',
        area: 'Downtown Dubai',
        estimated_value: 850,
        message: 'Looking for full deep steam cleaning including kitchen appliances.',
      },
      villa: {
        form_title: 'Villa Exterior & Window Cleaning',
        source_url: 'https://safaeewala.com/services/villa-cleaning',
        full_name: 'Sheikha Maryam',
        phone: '+971 55 882 4410',
        email: 'm.sheikha@almaktoum.ae',
        category: 'Villa Cleaning',
        service: 'Villa Glass Facade & Patio Washing',
        address: 'Villa 108, District One, MBR City',
        area: 'District One',
        estimated_value: 1500,
        message: 'Need high-pressure floor washing and double-height glass cleaning.',
      },
      movein: {
        form_title: 'Move In / Move Out Cleaning Booking',
        source_url: 'https://safaeewala.com/services/move-in-out-cleaning',
        full_name: 'David & Sarah Jenkins',
        phone: '+971 52 449 1802',
        email: 'david.j@gmail.com',
        category: 'Move In / Out',
        service: 'Move-In Deep Sanitization',
        address: 'Villa 32, Maple 1, Dubai Hills Estate',
        area: 'Dubai Hills',
        estimated_value: 1100,
        message: 'New tenants moving in this Sunday. Need full disinfection certificate.',
      },
      sofa: {
        form_title: 'Sofa & Carpet Steam Shampooing',
        source_url: 'https://safaeewala.com/services/sofa-carpet-shampooing',
        full_name: 'Nadia Kamran',
        phone: '+971 56 312 9081',
        email: 'nadia.kamran@hotmail.com',
        category: 'Sofa & Carpet',
        service: '5-Seater Sofa & Mattress Cleaning',
        address: 'Apartment 402, Shoreline 8, Palm Jumeirah',
        area: 'Palm Jumeirah',
        estimated_value: 450,
        message: 'Need urgent steam stain removal for living room sofa.',
      },
    }

    const payload = presets[preset]
    const newLead = parseFluentFormWebhook(payload)

    setLeads(prev => {
      const updated = [newLead, ...prev]
      saveLeadsLocally(updated)
      return updated
    })
    insertFluentFormLead(newLead)
    setShowSimulateModal(false)
    triggerToast(`🚀 Received new Fluent Forms Webhook from ${newLead.page_source}!`)
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

      // 5. Date filter
      const leadDate = l.created_at.split('T')[0]
      const today = new Date().toISOString().split('T')[0]
      let matchDate = true
      if (datePreset === 'today') {
        matchDate = leadDate === today
      } else if (datePreset === '7days') {
        const d7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        matchDate = leadDate >= d7
      } else if (datePreset === '30days') {
        const d30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        matchDate = leadDate >= d30
      }

      return matchSearch && matchPage && matchCat && matchStatus && matchDate
    })
  }, [leads, search, pageFilter, catFilter, statusFilter, datePreset])

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

      {/* ── Page Hero ── */}
      <PageHero
        title="Fluent Forms & Website Leads"
        subtitle={`Live Webhook receiver from safaeewala.com WordPress Fluent Forms · ${totalLeads} total inquiries analyzed`}
        statusChip="Webhook Active · Listening"
        actionLabel="Webhook Setup"
        onAction={() => setShowWebhookModal(true)}
        searchPlaceholder="Search leads, phone, page URL…"
      />

      {/* ── Quick Action Strip ── */}
      <div className="flex items-center justify-between flex-wrap gap-3 bg-white rounded-[22px] border border-[#E4E8EC] p-4 shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
            <Globe size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-bold text-[#111827]">WordPress Fluent Forms Webhook Sync</span>
              <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Receiving
              </span>
            </div>
            <p className="text-[12px] text-slate-500 mt-0.5">
              All website form submissions automatically land here in real time.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowSimulateModal(true)}
            className="flex items-center gap-1.5 text-[12px] font-bold px-3.5 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 text-indigo-700 border border-indigo-200 rounded-xl hover:from-blue-100 hover:to-indigo-100 transition-all cursor-pointer shadow-xs"
          >
            <Sparkles size={13} className="text-indigo-600" /> Simulate Test Lead
          </button>

          <button
            onClick={() => setShowWebhookModal(true)}
            className="flex items-center gap-1.5 text-[12px] font-bold px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all cursor-pointer"
          >
            <Send size={13} /> Webhook Endpoint URL
          </button>

          <button
            onClick={() => exportLeadsToXLSX(filteredLeads)}
            className="flex items-center gap-1.5 text-[12px] font-bold px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl transition-all cursor-pointer"
          >
            <FileSpreadsheet size={13} /> Export Excel
          </button>
        </div>
      </div>

      {/* ── 6 Performance KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {[
          {
            label: 'Total Inquiries',
            value: totalLeads,
            sub: `${newLeadsCount} new unread`,
            icon: Globe,
            iconBg: 'bg-blue-50',
            iconColor: 'text-blue-600',
            highlight: 'All Time',
          },
          {
            label: 'Best Performing Page',
            value: bestPage ? bestPage.page : '/deep-cleaning',
            sub: `${bestPage?.leadsCount || 0} leads (${bestPage?.share || 0}% share)`,
            icon: TrendingUp,
            iconBg: 'bg-emerald-50',
            iconColor: 'text-emerald-600',
            highlight: 'Top Driver',
            isSmallText: true,
          },
          {
            label: 'Top Category',
            value: topCategory ? topCategory.category : 'Deep Cleaning',
            sub: `${topCategory?.count || 0} inquiries · AED ${(topCategory?.totalValue || 0).toLocaleString()}`,
            icon: BarChart3,
            iconBg: 'bg-purple-50',
            iconColor: 'text-purple-600',
            highlight: 'High Demand',
            isSmallText: true,
          },
          {
            label: 'Conversion Rate',
            value: `${overallConvRate}%`,
            sub: `${totalConverted} converted to bookings`,
            icon: CheckCircle,
            iconBg: 'bg-indigo-50',
            iconColor: 'text-indigo-600',
            highlight: '+12% vs last mo',
          },
          {
            label: 'Pipeline Value',
            value: `AED ${totalPipeline.toLocaleString()}`,
            sub: `Avg AED ${Math.round(totalPipeline / (totalLeads || 1))} / inquiry`,
            icon: ArrowUpRight,
            iconBg: 'bg-amber-50',
            iconColor: 'text-amber-600',
            highlight: 'Potential',
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

          {/* Date Range Presets */}
          <div className="flex items-center gap-1.5 bg-[#f8fafc] p-1 rounded-xl border border-[#E4E8EC]">
            {[
              { id: 'all',    label: 'All Time' },
              { id: 'today',  label: 'Today' },
              { id: '7days',  label: 'Last 7 Days' },
              { id: '30days', label: 'Last 30 Days' },
            ].map(p => (
              <button
                key={p.id}
                onClick={() => setDatePreset(p.id as any)}
                className={`text-[11.5px] font-bold px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  datePreset === p.id
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

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

          {(search || pageFilter !== 'ALL' || catFilter !== 'ALL' || statusFilter !== 'ALL' || datePreset !== 'all') && (
            <button
              onClick={() => {
                setSearch('')
                setPageFilter('ALL')
                setCatFilter('ALL')
                setStatusFilter('ALL')
                setDatePreset('all')
              }}
              className="text-[11.5px] font-bold text-rose-600 hover:text-rose-800 ml-auto cursor-pointer"
            >
              ✕ Reset All Filters
            </button>
          )}
        </div>
      </div>

      {/* ── Fluent Forms Leads Table ── */}
      <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E4E8EC] flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-[15px] font-bold text-[#111827]">
              Form Submissions ({filteredLeads.length})
            </h3>
            <p className="text-[12px] text-slate-500 mt-0.5">
              Showing leads sorted chronologically by submission timestamp
            </p>
          </div>
          <span className="text-[12px] font-bold text-slate-500">
            Total Pipeline in view: <strong className="text-emerald-700">AED {filteredLeads.reduce((s, l) => s + (Number(l.estimated_value) || 0), 0).toLocaleString()}</strong>
          </span>
        </div>

        {filteredLeads.length === 0 ? (
          <div className="py-16 text-center">
            <Globe className="mx-auto mb-3 text-slate-300" size={42} strokeWidth={1.25} />
            <p className="text-[15px] font-bold text-slate-700">No Form Leads Match Criteria</p>
            <p className="text-[12px] text-slate-400 mt-1 max-w-sm mx-auto">
              Try resetting your filters or click "Simulate Test Lead" to send a sample WordPress Fluent Forms payload.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[12px]">
              <thead className="bg-[#f8fafc] border-b border-[#E4E8EC] text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Submitted At</th>
                  <th className="py-3 px-3">Client & Contact</th>
                  <th className="py-3 px-3">Page Source</th>
                  <th className="py-3 px-3">Category & Service</th>
                  <th className="py-3 px-4">Message / Requirements</th>
                  <th className="py-3 px-3 text-right">Est. Value</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E8EC]">
                {filteredLeads.map(lead => {
                  const catCfg = categoryColors[lead.category] || { bg: 'bg-slate-50', text: 'text-slate-700' }
                  const stCfg = statusBadgeConfig[lead.status] || statusBadgeConfig.new
                  const waNumber = (lead.whatsapp || lead.phone || '').replace(/[^0-9]/g, '')

                  return (
                    <tr key={lead.id} className="hover:bg-indigo-50/20 transition-colors">
                      {/* Date & Time */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <p className="font-bold text-slate-800">{formatDate(lead.created_at)}</p>
                        <p className="text-[10.5px] text-slate-400 mt-0.5">
                          {new Date(lead.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </td>

                      {/* Client & Contact */}
                      <td className="py-3 px-3 min-w-[160px]">
                        <p className="font-bold text-[#111827]">{lead.client_name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <a
                            href={`tel:${lead.phone}`}
                            className="inline-flex items-center gap-1 text-[11px] text-slate-600 hover:text-emerald-700 font-medium"
                            title="Call client"
                          >
                            <Phone size={11} className="text-slate-400" /> {lead.phone}
                          </a>
                          {waNumber && (
                            <a
                              href={`https://wa.me/${waNumber}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] font-bold bg-emerald-100 text-emerald-800 hover:bg-emerald-200 px-1.5 py-0.5 rounded transition-colors"
                              title="Chat on WhatsApp"
                            >
                              WhatsApp
                            </a>
                          )}
                        </div>
                        {lead.email && (
                          <p className="text-[10.5px] text-slate-400 truncate max-w-[180px] mt-0.5">{lead.email}</p>
                        )}
                      </td>

                      {/* Page Source */}
                      <td className="py-3 px-3 min-w-[140px] max-w-[180px]">
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

                      {/* Category & Service */}
                      <td className="py-3 px-3 min-w-[140px]">
                        <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded-full ${catCfg.bg} ${catCfg.text}`}>
                          {lead.category}
                        </span>
                        <p className="text-[11.5px] font-medium text-slate-700 mt-1 truncate" title={lead.service}>
                          {lead.service || `${lead.category} Inquiry`}
                        </p>
                        {lead.area && (
                          <p className="text-[10.5px] text-slate-400 truncate">Area: {lead.area}</p>
                        )}
                      </td>

                      {/* Message / Requirements */}
                      <td className="py-3 px-4 max-w-[220px]">
                        <p className="text-slate-700 text-[11.5px] line-clamp-2" title={lead.message}>
                          {lead.message || 'No additional notes provided'}
                        </p>
                        {lead.preferred_date && (
                          <p className="text-[10px] text-indigo-600 font-semibold mt-0.5">
                            Pref: {lead.preferred_date} {lead.preferred_time ? `@ ${lead.preferred_time}` : ''}
                          </p>
                        )}
                      </td>

                      {/* Est. Value */}
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <span className="font-extrabold text-[#111827] text-[13px]">
                          AED {Number(lead.estimated_value || 0).toLocaleString()}
                        </span>
                      </td>

                      {/* Status Selector */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
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

                      {/* Actions */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {lead.status !== 'converted' ? (
                            <button
                              onClick={() => setConvertingLead(lead)}
                              className="inline-flex items-center gap-1 text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1.5 rounded-xl shadow-xs transition-colors cursor-pointer"
                              title="Convert inquiry to official Booking"
                            >
                              <Plus size={12} /> Convert
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg">
                              <CheckCircle size={12} /> Booked
                            </span>
                          )}

                          <button
                            onClick={() => setSelectedLead(lead)}
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
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal 1: Webhook Setup & Documentation ── */}
      <Modal
        open={showWebhookModal}
        onClose={() => setShowWebhookModal(false)}
        title="WordPress Fluent Forms Webhook Configuration"
        size="lg"
      >
        <div className="space-y-5">
          <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-200">
            <h4 className="text-[14px] font-bold text-indigo-950 flex items-center gap-2 mb-1">
              <Globe size={16} className="text-indigo-600" />
              Fluent Forms Webhook Receiver Endpoint
            </h4>
            <p className="text-[12px] text-indigo-800 leading-relaxed">
              In your WordPress dashboard, navigate to <strong>Fluent Forms &rarr; Select Form &rarr; Settings & Integrations &rarr; Webhooks</strong>. Click <strong>Add Webhook</strong> and configure with the endpoint URL below.
            </p>
          </div>

          <div>
            <label className="text-[12px] font-bold text-slate-700 block mb-1">Webhook Endpoint URL (POST)</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={webhookConfig.restEndpoint}
                className="flex-1 text-[12px] font-mono p-2.5 bg-slate-50 border border-[#E4E8EC] rounded-xl text-slate-800 select-all"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(webhookConfig.restEndpoint)
                  setCopiedUrl(true)
                  setTimeout(() => setCopiedUrl(false), 2000)
                }}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-[#111827] text-white rounded-xl text-[12px] font-bold hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
              >
                {copiedUrl ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                {copiedUrl ? 'Copied!' : 'Copy URL'}
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
              <strong className="text-[#111827] text-[13px]">JSON</strong>
            </div>
          </div>

          <div>
            <label className="text-[12px] font-bold text-slate-700 block mb-1">Recommended Field Mappings</label>
            <div className="border border-[#E4E8EC] rounded-xl overflow-hidden text-[11.5px]">
              <table className="w-full text-left">
                <thead className="bg-[#f8fafc] text-slate-600 font-bold border-b border-[#E4E8EC]">
                  <tr>
                    <th className="py-2 px-3">Field in CRM</th>
                    <th className="py-2 px-3">Fluent Forms Parameter</th>
                    <th className="py-2 px-3">Purpose</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf2f7] text-slate-700">
                  <tr>
                    <td className="py-2 px-3 font-mono font-bold text-indigo-700">client_name</td>
                    <td className="py-2 px-3 font-mono">{'{inputs.names}'} or {'{inputs.full_name}'}</td>
                    <td className="py-2 px-3">Customer name</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-mono font-bold text-indigo-700">phone</td>
                    <td className="py-2 px-3 font-mono">{'{inputs.phone}'} or {'{inputs.mobile}'}</td>
                    <td className="py-2 px-3">Customer phone number</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-mono font-bold text-indigo-700">source_url</td>
                    <td className="py-2 px-3 font-mono">{'{embedded_url}'} or {'{http_referer}'}</td>
                    <td className="py-2 px-3">Landing page for attribution</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-mono font-bold text-indigo-700">category</td>
                    <td className="py-2 px-3 font-mono">{'{inputs.service}'} or Deep Cleaning / Villa</td>
                    <td className="py-2 px-3">Service category</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-mono font-bold text-indigo-700">message</td>
                    <td className="py-2 px-3 font-mono">{'{inputs.message}'} or {'{inputs.notes}'}</td>
                    <td className="py-2 px-3">Customer requirements</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[12px] font-bold text-slate-700">Test cURL Command</label>
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
            <pre className="text-[11px] font-mono p-3 bg-slate-900 text-slate-100 rounded-xl overflow-x-auto">
              {webhookConfig.sampleCurl}
            </pre>
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={() => setShowWebhookModal(false)}>Close Guide</Button>
          </div>
        </div>
      </Modal>

      {/* ── Modal 2: Simulate Test Webhook Lead ── */}
      <Modal
        open={showSimulateModal}
        onClose={() => setShowSimulateModal(false)}
        title="Simulate Incoming Fluent Forms Lead"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-[13px] text-slate-600">
            Select a landing page and service preset to simulate a live Fluent Forms submission from your website:
          </p>

          <div className="space-y-2.5">
            {[
              {
                id: 'deep',
                title: 'Deep Cleaning Inquiry',
                page: '/services/deep-cleaning',
                client: 'Hamza Tariq (Downtown Views)',
                amount: 'AED 850',
                color: 'border-teal-300 hover:bg-teal-50/40',
              },
              {
                id: 'villa',
                title: 'Villa Exterior Glass & Facade',
                page: '/services/villa-cleaning',
                client: 'Sheikha Maryam (District One)',
                amount: 'AED 1,500',
                color: 'border-emerald-300 hover:bg-emerald-50/40',
              },
              {
                id: 'movein',
                title: 'Move-In Deep Sanitization',
                page: '/services/move-in-out-cleaning',
                client: 'David & Sarah (Dubai Hills)',
                amount: 'AED 1,100',
                color: 'border-indigo-300 hover:bg-indigo-50/40',
              },
              {
                id: 'sofa',
                title: 'Sofa & Carpet Shampooing',
                page: '/services/sofa-carpet-shampooing',
                client: 'Nadia Kamran (Palm Jumeirah)',
                amount: 'AED 450',
                color: 'border-amber-300 hover:bg-amber-50/40',
              },
            ].map(p => (
              <div
                key={p.id}
                onClick={() => handleSimulateWebhook(p.id as any)}
                className={`p-3.5 rounded-xl border bg-white cursor-pointer transition-all flex items-center justify-between ${p.color}`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-[13px] font-bold text-[#111827]">{p.title}</p>
                    <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                      {p.page}
                    </span>
                  </div>
                  <p className="text-[12px] text-slate-500 mt-0.5">{p.client}</p>
                </div>
                <div className="text-right">
                  <span className="text-[13px] font-extrabold text-indigo-700">{p.amount}</span>
                  <span className="text-[11px] block text-emerald-600 font-bold mt-0.5">Send Webhook &rarr;</span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={() => setShowSimulateModal(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>

      {/* ── Modal 3: Convert Lead to Booking ── */}
      <Modal
        open={!!convertingLead}
        onClose={() => setConvertingLead(null)}
        title="Convert Lead to Confirmed Booking"
        size="lg"
      >
        {convertingLead && (
          <form onSubmit={handleConvertBooking} className="space-y-4">
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-[12.5px] leading-relaxed">
              Converting lead for <strong>{convertingLead.client_name}</strong> from <strong>{convertingLead.page_source}</strong>. This will automatically create an official Booking in your calendar and register the client.
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

      {/* ── Modal 4: View Lead Details ── */}
      <Modal
        open={!!selectedLead}
        onClose={() => setSelectedLead(null)}
        title="Form Submission Details"
        size="lg"
      >
        {selectedLead && (
          <div className="space-y-4 text-[13px]">
            <div className="flex items-center justify-between pb-3 border-b border-[#E4E8EC]">
              <div>
                <h4 className="text-[17px] font-bold text-[#111827]">{selectedLead.client_name}</h4>
                <p className="text-[12px] text-slate-500 mt-0.5">
                  Submitted on {formatDate(selectedLead.created_at)} at {new Date(selectedLead.created_at).toLocaleTimeString()}
                </p>
              </div>
              <span className={`text-[11px] font-bold px-3 py-1 rounded-full border ${statusBadgeConfig[selectedLead.status]?.bg} ${statusBadgeConfig[selectedLead.status]?.text} ${statusBadgeConfig[selectedLead.status]?.border}`}>
                {statusBadgeConfig[selectedLead.status]?.label}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-slate-50 rounded-xl border border-[#edf2f7]">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Phone / WhatsApp</span>
                <a href={`tel:${selectedLead.phone}`} className="font-bold text-[#111827] hover:text-emerald-700">
                  {selectedLead.phone}
                </a>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-[#edf2f7]">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Email Address</span>
                <p className="font-bold text-[#111827] truncate">{selectedLead.email || 'None'}</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-[#edf2f7]">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Page Source</span>
                <p className="font-bold text-indigo-700 truncate">{selectedLead.page_source}</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-[#edf2f7]">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Service Category</span>
                <p className="font-bold text-[#111827]">{selectedLead.category}</p>
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
        )}
      </Modal>

    </div>
  )
}
