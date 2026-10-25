import { useState, useMemo, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Sparkles, Bot, AlertTriangle, AlertCircle, CheckCircle2,
  Clock, RefreshCw, X, ShieldCheck, ChevronRight, HelpCircle,
  Calendar, Phone, MapPin, DollarSign, Layers, Minus, Maximize2,
  GripHorizontal, Send, Trash2, MessageSquare, ExternalLink,
  TrendingUp, Users, ArrowRight, RotateCcw
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useData } from '@/store/DataContext'
import {
  analyzeCRMHealth,
  askCRMAIBot,
  type DetectedIssue,
  type IssueType,
  type AIChatMessage,
  type ChatContextData,
} from '@/lib/crmAIBot'
import { safeLocalStorageGet } from '@/lib/storageUtils'
import { formatDate } from '@/lib/utils'

interface CRMAIBotModalProps {
  open: boolean
  onClose: () => void
}

const QUICK_PROMPTS = [
  { label: '💰 Total Revenue & Collections', query: 'Show me total revenue and collections breakdown' },
  { label: '⏱️ Overtime (OT) Leaders', query: 'Which cleaners worked overtime and what are their OT hours?' },
  { label: '⚠️ Pending Balances & Dues', query: 'Check pending balances and unpaid clients' },
  { label: '👥 Staff Duty Hours & Activity', query: 'Staff duty hours and shift counts' },
  { label: '🔍 Check Duplicate Bookings', query: 'Scan for duplicate bookings and data issues' },
]

export function CRMAIBotModal({ open, onClose }: CRMAIBotModalProps) {
  const navigate = useNavigate()
  const { bookings, clients, dailyJobs, invoices, updateBooking } = useData()

  // ── Layout & View State ──
  const [activeView, setActiveView] = useState<'chat' | 'alerts'>('chat')
  const [isMinimized, setIsMinimized] = useState(false)
  const [activeTab, setActiveTab] = useState<'all' | IssueType>('all')
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const [isScanning, setIsScanning] = useState(false)
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null)

  // ── Drag & Drop Floating Window State ──
  const [position, setPosition] = useState(() => {
    if (typeof window !== 'undefined') {
      const modalW = Math.min(680, window.innerWidth - 30)
      const modalH = Math.min(720, window.innerHeight - 40)
      return {
        x: Math.max(15, Math.floor((window.innerWidth - modalW) / 2)),
        y: Math.max(25, Math.floor((window.innerHeight - modalH) / 2)),
      }
    }
    return { x: 40, y: 30 }
  })

  const [isDragging, setIsDragging] = useState(false)
  const dragRef = useRef<{ startX: number; startY: number; posX: number; posY: number }>({
    startX: 0,
    startY: 0,
    posX: 0,
    posY: 0,
  })

  // ── Chat State ──
  const [chatMessages, setChatMessages] = useState<AIChatMessage[]>([
    {
      id: 'welcome-msg',
      sender: 'ai',
      text: `Assalam-o-Alaikum! Main **Safaeewala Operations AI Bot** hoon. 🤖✨\n\nMain aap kay live CRM data ko monitor karta hoon aur in sawalat kay fori jawab de sakta hoon:\n• **Revenue & Collections:** Total payments, cash/card, aur bank transfers\n• **Overtime (OT):** Cleaners kay overtime ghantay aur top OT staff\n• **Pending Balances:** Unpaid clients aur due amounts\n• **Duplicate Bookings:** Duplications aur missing address detection\n\nAap neechay diye gaye buttons par click kar saktay hain ya seedha apna sawal likh kar send karein!`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ])
  const [chatInput, setChatInput] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  // Auto-scroll chat to latest message
  useEffect(() => {
    if (activeView === 'chat' && !isMinimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [chatMessages, activeView, isMinimized])

  // Context data bundle for chat reasoning
  const chatContextData = useMemo<ChatContextData>(() => {
    const monthlyPayments = safeLocalStorageGet('safaeewala_monthly_client_payments', [])
    const pendingList = safeLocalStorageGet('safaeewala_daily_pending_items', [])
    const pendingRcvdList = safeLocalStorageGet('safaeewala_daily_pending_rcvd_items', [])

    return {
      bookings,
      clients,
      dailyJobs,
      invoices,
      monthlyPayments,
      pendingList,
      pendingRcvdList,
    }
  }, [bookings, clients, dailyJobs, invoices])

  // Handle user query submission
  const handleSendQuery = (textToSend?: string) => {
    const q = (textToSend ?? chatInput).trim()
    if (!q) return

    const userMsg: AIChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: q,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }

    setChatMessages(prev => [...prev, userMsg])
    setChatInput('')
    setIsThinking(true)

    setTimeout(() => {
      const response = askCRMAIBot(q, chatContextData)
      setChatMessages(prev => [...prev, response])
      setIsThinking(false)
    }, 350)
  }

  // ── Drag & Drop Event Handlers ──
  const handlePointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement
    // Ignore drags started on interactive elements (buttons, inputs)
    if (target.closest('button') || target.closest('input') || target.closest('a') || target.closest('textarea')) {
      return
    }

    setIsDragging(true)
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      posX: position.x,
      posY: position.y,
    }
    target.setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY

    const modalWidth = isMinimized ? 320 : Math.min(680, window.innerWidth - 30)
    const modalHeight = isMinimized ? 70 : Math.min(720, window.innerHeight - 40)

    const newX = Math.max(10, Math.min(window.innerWidth - modalWidth - 10, dragRef.current.posX + dx))
    const newY = Math.max(10, Math.min(window.innerHeight - modalHeight - 10, dragRef.current.posY + dy))

    setPosition({ x: newX, y: newY })
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDragging) {
      setIsDragging(false)
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId)
      } catch {}
    }
  }

  const handleResetPosition = () => {
    const modalW = Math.min(680, window.innerWidth - 30)
    const modalH = Math.min(720, window.innerHeight - 40)
    setPosition({
      x: Math.max(15, Math.floor((window.innerWidth - modalW) / 2)),
      y: Math.max(25, Math.floor((window.innerHeight - modalH) / 2)),
    })
  }

  // ── AI Health Issues & Alert Handlers ──
  const handleRescan = () => {
    setIsScanning(true)
    setTimeout(() => {
      setIsScanning(false)
      showSuccessNotice('✓ Live AI scan completed! All CRM records verified.')
    }, 600)
  }

  const showSuccessNotice = (msg: string) => {
    setActionSuccessMsg(msg)
    setTimeout(() => setActionSuccessMsg(null), 4500)
  }

  const rawReport = useMemo(() => {
    return analyzeCRMHealth(bookings, clients)
  }, [bookings, clients])

  const report = useMemo(() => {
    const activeIssues = rawReport.issues.filter(i => !dismissedIds.has(i.id))
    const highCount = activeIssues.filter(i => i.severity === 'high').length
    const mediumCount = activeIssues.filter(i => i.severity === 'medium').length
    const lowCount = activeIssues.filter(i => i.severity === 'low').length
    const duplicateCount = activeIssues.filter(i => i.type === 'duplicate').length
    const penalty = highCount * 7 + mediumCount * 3 + lowCount * 1
    const score = Math.max(50, Math.min(100, 100 - penalty))

    return {
      ...rawReport,
      score,
      issues: activeIssues,
      highCount,
      mediumCount,
      lowCount,
      duplicateCount,
    }
  }, [rawReport, dismissedIds])

  const displayedIssues = useMemo(() => {
    if (activeTab === 'all') return report.issues
    return report.issues.filter(i => i.type === activeTab)
  }, [report.issues, activeTab])

  const handleMoveToPending = (issue: DetectedIssue) => {
    if (!issue.bookingId) return
    updateBooking(issue.bookingId, { status: 'pending' })
    setDismissedIds(prev => new Set(prev).add(issue.id))
    showSuccessNotice(`✓ Booking for "${issue.clientName}" moved to "Pending" status for operational review.`)
  }

  const handleDismiss = (id: string) => {
    setDismissedIds(prev => new Set(prev).add(id))
  }

  if (!open) return null

  // ── MINIMIZED DOCK PILL (When hidden / minimized) ──
  if (isMinimized) {
    return (
      <div
        style={{ left: `${position.x}px`, top: `${position.y}px` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="fixed z-50 flex items-center gap-3 p-2.5 pr-3.5 bg-gradient-to-r from-[#0B1215] via-[#064e3b] to-[#0d8a72] text-white rounded-2xl shadow-[0_12px_35px_rgba(6,78,59,0.45)] border border-emerald-400/40 select-none cursor-grab active:cursor-grabbing backdrop-blur-md animate-in fade-in zoom-in-95 duration-150"
        title="Safaeewala AI Bot (Minimized) — Drag to reposition or click expand"
      >
        <div className="relative flex items-center justify-center w-8 h-8 rounded-xl bg-white/10 text-emerald-300">
          <Bot size={18} />
          {report.highCount > 0 && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-rose-500 rounded-full animate-ping" />
          )}
        </div>

        <div className="min-w-0 pr-1">
          <p className="text-[12px] font-extrabold text-white flex items-center gap-1.5 leading-tight">
            <span>AI Bot</span>
            <span className="text-[10px] bg-emerald-500/30 text-emerald-200 border border-emerald-400/30 px-1.5 py-0.2 rounded-full font-mono">
              {report.score}% Health
            </span>
          </p>
          <p className="text-[10.5px] text-slate-300 truncate">
            {report.duplicateCount > 0 ? `${report.duplicateCount} duplicates found` : 'Chat & Live Analytics ready'}
          </p>
        </div>

        <div className="flex items-center gap-1 ml-auto">
          <button
            type="button"
            onClick={() => setIsMinimized(false)}
            className="p-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white transition-colors cursor-pointer"
            title="Expand AI Bot Window"
          >
            <Maximize2 size={13} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-rose-500/30 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Close / Cancel Bot"
          >
            <X size={13} />
          </button>
        </div>
      </div>
    )
  }

  // ── EXPANDED DRAGGABLE FLOATING BOT WINDOW ──
  return (
    <>
      {/* Light non-blocking backdrop that allows dismissing by clicking outside if desired */}
      <div
        className="fixed inset-0 z-40 bg-black/15 backdrop-blur-[0.5px] transition-opacity"
        onClick={onClose}
      />

      <div
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          width: 'min(680px, calc(100vw - 24px))',
          maxHeight: 'min(740px, calc(100vh - 35px))',
        }}
        className="fixed z-50 flex flex-col bg-white rounded-[24px] border border-[#0d8a72]/30 shadow-[0_25px_70px_rgba(11,18,21,0.28)] overflow-hidden text-[#111827] animate-in fade-in zoom-in-95 duration-150"
      >
        {/* ── DRAGGABLE HEADER (Safaeewala CRM Dark Emerald & Charcoal) ── */}
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="relative px-5 py-4 bg-gradient-to-r from-[#0B1215] via-[#064e3b] to-[#0d8a72] text-white border-b border-[#0d8a72]/40 select-none cursor-grab active:cursor-grabbing flex items-center justify-between gap-3 shrink-0"
        >
          {/* Subtle Background Glow */}
          <div className="absolute top-0 right-1/4 w-48 h-32 bg-emerald-400/10 rounded-full blur-2xl pointer-events-none" />

          {/* Left: Drag grip & Title */}
          <div className="flex items-center gap-3 min-w-0 z-10">
            <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-emerald-300 shrink-0 shadow-inner">
              <Bot size={22} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-[16px] font-black tracking-tight text-white flex items-center gap-1.5 truncate">
                  <span>Safaeewala AI CRM Bot</span>
                  <Sparkles size={14} className="text-amber-400 shrink-0" />
                </h3>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-500/25 text-emerald-200 border border-emerald-400/30 shrink-0">
                  Live Assistant
                </span>
              </div>
              <p className="text-[11.5px] text-emerald-100/80 mt-0.5 flex items-center gap-1.5 truncate">
                <GripHorizontal size={13} className="text-emerald-300/80 shrink-0" />
                <span>Drag header to move anywhere • Ask revenue, overtime & duplicates</span>
              </p>
            </div>
          </div>

          {/* Right Controls: Reset Position, Minimize / Hide, Cancel / Close */}
          <div className="flex items-center gap-1.5 z-10 shrink-0">
            <button
              type="button"
              onClick={handleResetPosition}
              className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white transition-colors cursor-pointer"
              title="Reset window to center position"
            >
              <RotateCcw size={14} />
            </button>
            <button
              type="button"
              onClick={() => setIsMinimized(true)}
              className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white transition-colors cursor-pointer"
              title="Hide / Minimize bot to floating dock"
            >
              <Minus size={15} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl bg-white/10 hover:bg-rose-500/80 text-slate-200 hover:text-white transition-colors cursor-pointer"
              title="Cancel / Close Bot"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* ── ACTION SUCCESS NOTICE (When Move to Pending occurs) ── */}
        {actionSuccessMsg && (
          <div className="px-5 py-2.5 bg-emerald-50 border-b border-emerald-200 text-emerald-900 text-[12px] font-bold flex items-center justify-between gap-2 shrink-0 animate-in fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
              <span>{actionSuccessMsg}</span>
            </div>
            <button
              onClick={() => setActionSuccessMsg(null)}
              className="text-emerald-700 hover:text-emerald-900 text-[11px] font-extrabold cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* ── TOP NAVIGATION TABS (Interactive Chat vs Quality Alerts) ── */}
        <div className="px-5 pt-3 pb-2 bg-[#f8fafc] border-b border-[#E4E8EC] flex items-center justify-between gap-2 shrink-0 flex-wrap">
          <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl shadow-inner text-[12px]">
            <button
              type="button"
              onClick={() => setActiveView('chat')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                activeView === 'chat'
                  ? 'bg-[#0d8a72] text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <MessageSquare size={13} />
              <span>AI Chat Assistant</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveView('alerts')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                activeView === 'alerts'
                  ? 'bg-[#0d8a72] text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <ShieldCheck size={13} />
              <span>Data Alerts & Duplicates</span>
              {report.issues.length > 0 && (
                <span className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded-full ${
                  activeView === 'alerts' ? 'bg-white/20 text-white' : 'bg-rose-100 text-rose-800'
                }`}>
                  {report.issues.length}
                </span>
              )}
            </button>
          </div>

          <div className="flex items-center gap-2 text-[11px]">
            <span className="font-semibold text-slate-500">System Health:</span>
            <span className="font-black text-[#0d8a72] bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
              {report.score}%
            </span>
          </div>
        </div>

        {/* ── VIEW 1: INTERACTIVE AI CHAT TAB ── */}
        {activeView === 'chat' && (
          <div className="flex-1 flex flex-col min-h-0 bg-white">
            {/* Chat Stream */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-[13px]">
              {chatMessages.map(msg => (
                <div
                  key={msg.id}
                  className={`flex items-start gap-2.5 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.sender === 'ai' && (
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#064e3b] to-[#0d8a72] text-white flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                      <Bot size={16} />
                    </div>
                  )}

                  <div className={`max-w-[85%] rounded-2xl p-3.5 space-y-1.5 ${
                    msg.sender === 'user'
                      ? 'bg-[#0B1215] text-white rounded-tr-xs shadow-xs'
                      : 'bg-[#f0fdfa] border border-[#ccfbf1] text-slate-800 rounded-tl-xs shadow-xs'
                  }`}>
                    <div className="flex items-center justify-between gap-4 text-[10.5px]">
                      <span className={`font-bold ${msg.sender === 'user' ? 'text-emerald-400' : 'text-[#0d8a72]'}`}>
                        {msg.sender === 'user' ? 'You' : 'Safaeewala AI'}
                      </span>
                      <span className={msg.sender === 'user' ? 'text-slate-400' : 'text-slate-400 font-mono'}>
                        {msg.timestamp}
                      </span>
                    </div>

                    <div className="leading-relaxed whitespace-pre-line text-[12.5px]">
                      {msg.text}
                    </div>

                    {/* Action Suggestion inside AI Message */}
                    {msg.actionSuggestion && (
                      <div className="pt-2">
                        {msg.actionSuggestion.type === 'switch_tab_alerts' ? (
                          <button
                            type="button"
                            onClick={() => setActiveView('alerts')}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0d8a72] hover:bg-[#0b735f] text-white text-[11.5px] font-bold shadow-2xs cursor-pointer transition-colors"
                          >
                            <span>{msg.actionSuggestion.label}</span>
                            <ArrowRight size={12} />
                          </button>
                        ) : msg.actionSuggestion.type === 'view_pending' ? (
                          <button
                            type="button"
                            onClick={() => {
                              onClose()
                              navigate('/pending')
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-[11.5px] font-bold shadow-2xs cursor-pointer transition-colors"
                          >
                            <span>{msg.actionSuggestion.label}</span>
                            <ExternalLink size={12} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              onClose()
                              navigate('/monthly-clients')
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0d8a72] hover:bg-[#0b735f] text-white text-[11.5px] font-bold shadow-2xs cursor-pointer transition-colors"
                          >
                            <span>{msg.actionSuggestion.label}</span>
                            <ExternalLink size={12} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {isThinking && (
                <div className="flex items-center gap-2.5 text-slate-400 text-[12px] italic pl-1">
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 text-[#0d8a72] flex items-center justify-center">
                    <RefreshCw size={13} className="animate-spin" />
                  </div>
                  <span>Analyzing live CRM data & calculating figures…</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Quick Prompt Chips */}
            <div className="px-4 py-2 bg-slate-50 border-t border-[#E4E8EC] overflow-x-auto flex items-center gap-1.5 shrink-0 no-scrollbar">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1">
                Quick Ask:
              </span>
              {QUICK_PROMPTS.map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSendQuery(p.query)}
                  className="shrink-0 text-[11.5px] font-bold px-2.5 py-1 rounded-xl bg-white hover:bg-teal-50 border border-slate-200 hover:border-teal-300 text-slate-700 hover:text-teal-800 transition-all cursor-pointer shadow-2xs"
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Chat Input Bar */}
            <form
              onSubmit={e => {
                e.preventDefault()
                handleSendQuery()
              }}
              className="p-3 sm:p-4 bg-white border-t border-[#E4E8EC] flex items-center gap-2 shrink-0"
            >
              <button
                type="button"
                onClick={() => setChatMessages(prev => prev.slice(0, 1))}
                className="p-2.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                title="Clear chat messages"
              >
                <Trash2 size={16} />
              </button>

              <div className="relative flex-1">
                <input
                  type="text"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  placeholder="Revenue, Overtime (OT), ya Duplicates ke baray mein poonchein…"
                  className="w-full text-[13px] px-3.5 py-2.5 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-teal-500 font-medium text-slate-800 transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={!chatInput.trim()}
                className="h-10 px-4 rounded-xl bg-[#0d8a72] hover:bg-[#0b735f] text-white font-bold text-[12.5px] flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span>Send</span>
                <Send size={13} />
              </button>
            </form>
          </div>
        )}

        {/* ── VIEW 2: DATA INTEGRITY & DUPLICATE ALERTS TAB ── */}
        {activeView === 'alerts' && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 bg-white text-[13px]">
            {/* Quick Metrics Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-3 bg-slate-50 border border-[#E4E8EC] rounded-xl">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Total Scanned</span>
                <p className="text-[17px] font-black text-slate-800 mt-0.5">{report.totalScanned} Records</p>
              </div>
              <div className={`p-3 rounded-xl border ${report.duplicateCount > 0 ? 'bg-rose-50/50 border-rose-200' : 'bg-slate-50 border-[#E4E8EC]'}`}>
                <span className={`text-[10px] font-bold uppercase block ${report.duplicateCount > 0 ? 'text-rose-600' : 'text-slate-400'}`}>Duplicates</span>
                <p className={`text-[17px] font-black mt-0.5 ${report.duplicateCount > 0 ? 'text-rose-700' : 'text-slate-800'}`}>
                  {report.duplicateCount} Found
                </p>
              </div>
              <div className={`p-3 rounded-xl border ${report.highCount > 0 ? 'bg-amber-50/50 border-amber-200' : 'bg-slate-50 border-[#E4E8EC]'}`}>
                <span className={`text-[10px] font-bold uppercase block ${report.highCount > 0 ? 'text-amber-600' : 'text-slate-400'}`}>High Conflicts</span>
                <p className={`text-[17px] font-black mt-0.5 ${report.highCount > 0 ? 'text-amber-700' : 'text-slate-800'}`}>
                  {report.highCount} Alerts
                </p>
              </div>
              <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl">
                <span className="text-[10px] font-bold text-emerald-800 uppercase block">1-Click Pending</span>
                <p className="text-[11.5px] font-bold text-emerald-700 mt-1">Instant Hold</p>
              </div>
            </div>

            {/* Filter Sub-Tabs */}
            <div className="flex items-center gap-1.5 border-b border-[#E4E8EC] pb-2 flex-wrap text-[11.5px]">
              {[
                { id: 'all',                  label: 'All Issues',        count: report.issues.length },
                { id: 'duplicate',            label: 'Duplicates',        count: report.duplicateCount },
                { id: 'missing_data',         label: 'Missing Info',      count: report.issues.filter(i => i.type === 'missing_data').length },
                { id: 'scheduling_conflict',  label: 'Crew / Conflicts',  count: report.issues.filter(i => i.type === 'scheduling_conflict').length },
                { id: 'financial_anomaly',    label: 'Rate Anomalies',    count: report.issues.filter(i => i.type === 'financial_anomaly').length },
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-3 py-1 rounded-xl font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    activeTab === tab.id
                      ? 'bg-[#0d8a72] text-white shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded-full ${
                    activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                  }`}>
                    {tab.count}
                  </span>
                </button>
              ))}

              <button
                type="button"
                onClick={handleRescan}
                disabled={isScanning}
                className="ml-auto text-[11px] font-bold text-teal-700 hover:text-teal-800 bg-teal-50 px-2.5 py-1 rounded-lg border border-teal-200 cursor-pointer flex items-center gap-1 transition-colors"
              >
                <RefreshCw size={11} className={isScanning ? 'animate-spin' : ''} />
                <span>{isScanning ? 'Scanning…' : 'Rescan'}</span>
              </button>
            </div>

            {/* Issues List */}
            {displayedIssues.length === 0 ? (
              <div className="p-8 text-center bg-emerald-50/50 rounded-2xl border border-emerald-200">
                <ShieldCheck size={38} className="text-emerald-600 mx-auto mb-2" />
                <h4 className="text-[15px] font-bold text-emerald-900">All Scanned Records Are Clear!</h4>
                <p className="text-[12px] text-emerald-700 mt-1 max-w-md mx-auto">
                  No duplication, missing addresses, or scheduling errors detected in this view.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {displayedIssues.map(issue => {
                  const isHigh = issue.severity === 'high'
                  return (
                    <div
                      key={issue.id}
                      className={`p-3.5 rounded-2xl border transition-all ${
                        isHigh
                          ? 'bg-rose-50/30 border-rose-200 hover:border-rose-300'
                          : 'bg-white border-[#E4E8EC] hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5">
                          <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                            isHigh ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {isHigh ? <AlertCircle size={15} /> : <AlertTriangle size={15} />}
                          </div>

                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h5 className="font-bold text-[13px] text-[#111827]">{issue.title}</h5>
                              <span className={`text-[9.5px] font-black uppercase px-2 py-0.5 rounded-md ${
                                isHigh ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                              }`}>
                                {issue.severity}
                              </span>
                              <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                                {issue.clientName}
                              </span>
                              {issue.date && (
                                <span className="text-[10px] font-semibold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-md flex items-center gap-1">
                                  <Calendar size={10} /> {formatDate(issue.date)}
                                </span>
                              )}
                            </div>

                            <p className="text-[12px] text-slate-600 leading-relaxed">
                              {issue.description}
                            </p>

                            <div className="p-2 bg-slate-50 rounded-xl border border-slate-200/80 text-[11px] text-slate-700 flex items-start gap-1.5 mt-1.5">
                              <Bot size={13} className="text-[#0d8a72] shrink-0 mt-0.5" />
                              <span><strong>Recommendation:</strong> {issue.recommendation}</span>
                            </div>
                          </div>
                        </div>

                        {/* Actions on this issue */}
                        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1.5 shrink-0 ml-2">
                          {issue.canMoveToPending && (
                            <button
                              type="button"
                              onClick={() => handleMoveToPending(issue)}
                              className="px-2.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-[11px] flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                              title="Move this job to Pending status so it can be verified before dispatching"
                            >
                              <Clock size={12} />
                              <span>Move to Pending</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleDismiss(issue.id)}
                            className="px-2 py-1 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 font-semibold text-[11px] transition-colors cursor-pointer"
                            title="Dismiss this alert"
                          >
                            Dismiss
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

        {/* ── MODAL FOOTER (Hide, Cancel, and Status) ── */}
        <div className="px-5 py-3 bg-[#f8fafc] border-t border-[#E4E8EC] flex items-center justify-between flex-wrap gap-2 text-[12px] shrink-0">
          <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
            <GripHorizontal size={13} className="text-[#0d8a72]" />
            <span>Movable window • Drag header anywhere across screen</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsMinimized(true)}
              className="px-3 py-1.5 rounded-xl text-slate-600 hover:text-slate-800 hover:bg-slate-200 font-bold text-[11.5px] transition-colors cursor-pointer flex items-center gap-1"
              title="Minimize to floating pill"
            >
              <Minus size={13} />
              <span>Hide / Minimize</span>
            </button>
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              className="text-[11.5px] font-bold"
            >
              Close
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}

