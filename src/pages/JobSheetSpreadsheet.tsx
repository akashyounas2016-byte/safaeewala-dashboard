import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import * as XLSX from 'xlsx'
import {
  ArrowLeft, FileSpreadsheet, Plus, Trash2, Save, Download,
  Upload, ChevronLeft, ChevronRight, RotateCcw, Calculator,
  Search, Check, X, Sparkles, Filter, Copy, HelpCircle,
  Maximize2, Minimize2, Undo2, Redo2, Palette, Layers, Table,
  Printer, MoreVertical, ChevronDown, ExternalLink, CornerDownLeft,
  ChevronUp, Eye, EyeOff, SlidersHorizontal, ArrowUp, ArrowDown,
  CloudUpload, Calendar, GripVertical, Info, History
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { useData } from '@/store/DataContext'
import type { DailyJob, PaymentMode, MaterialType } from '@/types'
import {
  calcHours, calcOTHours, formatTimeOnly, cleanNum, fmtDate, addDaysToYMD
} from '@/components/dailyJobSheet/jobSheetUtils'
import {
  authorizeGoogleDrive,
  getAccessToken,
  uploadToDrive,
  gdriveConfigured,
  getDriveWebhookUrl,
  sendDailySheetBackupViaWebhook,
} from '@/lib/googleDrive'
import { GoogleDriveWebhookModal } from '@/components/dailyJobSheet/GoogleDriveWebhookModal'
import { MonthlyScheduleSyncModal } from '@/components/dailyJobSheet/MonthlyScheduleSyncModal'
import {
  getScheduledMonthlyShiftsForDate,
  syncMonthlySchedulesToDailyJobs,
  buildPendingCalcContext,
  calcJobCollectable,
  getAssignableClients,
  type ScheduledShiftPlan,
} from '@/lib/clientDataSync'
import { safeLocalStorageSet, safeLocalStorageGet } from '@/lib/storageUtils'
import { todayDubai } from '@/lib/dubaiTime'
import { confirmAsync } from '@/lib/notify'
import { invoicedJobIds } from '@/lib/receivables'
import { fetchRecordHistory, type AuditEntry } from '@/lib/auditLog'

/* ─── Column Schema for the Excel Grid (Daily Job Sheet Exact Sequence) ─── */
export interface ColumnDef {
  col: string       // Excel letter: A, B, C...
  id: keyof DailyJob | 'pending' | 'row_num'
  label: string
  width: string
  type: 'text' | 'time' | 'date' | 'number' | 'select' | 'formula'
  options?: string[]
  formulaHint?: string
}

export const DEFAULT_COLUMN_DEFS: Omit<ColumnDef, 'col'>[] = [
  { id: 'date',         label: 'Date',             width: '110px', type: 'date',   formulaHint: 'YYYY-MM-DD' },
  { id: 'staff_name',   label: 'Staff Name',       width: '170px', type: 'text',   formulaHint: 'Cleaner/Driver name' },
  { id: 'start_time',   label: 'Start Time',       width: '100px', type: 'time',   formulaHint: 'e.g. 08:00 AM' },
  { id: 'end_time',     label: 'End Time',         width: '100px', type: 'time',   formulaHint: 'e.g. 04:00 PM' },
  { id: 'address',      label: 'Client / Address', width: '230px', type: 'text',   formulaHint: 'Customer location' },
  { id: 'area',         label: 'Location / Area',  width: '140px', type: 'text',   formulaHint: 'Dubai area/suburb' },
  { id: 'charges',      label: 'Charges (AED)',    width: '120px', type: 'number', formulaHint: '=SUM(...)' },
  { id: 'received',     label: 'Received (AED)',   width: '120px', type: 'number', formulaHint: 'Cash/Online collected' },
  { id: 'pending',      label: 'Pending (AED)',    width: '115px', type: 'formula', formulaHint: 'Charges minus Received' },
  { id: 'duty_hours',   label: 'Duty Hrs',         width: '90px',  type: 'number', formulaHint: '=calcHours(...)' },
  { id: 'ot_hours',     label: 'OT Hrs',           width: '90px',  type: 'number', formulaHint: '=calcOT(...)' },
  { id: 'material',     label: 'Material',         width: '95px',  type: 'select', options: ['No', 'Yes', 'Sofa', 'Ladder'] },
  { id: 'payment_mode', label: 'Payment Mode',     width: '125px', type: 'select', options: ['Cash', 'Online', 'Monthly', 'Pending'] },
  { id: 'remarks',      label: 'Remarks',          width: '170px', type: 'text',   formulaHint: 'Notes' },
  { id: 'service',      label: 'Service',          width: '135px', type: 'text',   formulaHint: 'Deep Clean, Regular, etc.' },
]

export function buildColumnsWithLetters(order: string[], hiddenIds: string[] = []): ColumnDef[] {
  const map = new Map<string, Omit<ColumnDef, 'col'>>(DEFAULT_COLUMN_DEFS.map(c => [c.id, c]))
  const validIds = order.filter(id => map.has(id))
  DEFAULT_COLUMN_DEFS.forEach(c => {
    if (!validIds.includes(c.id)) validIds.push(c.id)
  })
  const visibleIds = validIds.filter(id => !hiddenIds.includes(id))
  return visibleIds.map((id, idx) => {
    const def = map.get(id)!
    const colLetter = idx < 26
      ? String.fromCharCode(65 + idx)
      : String.fromCharCode(65 + Math.floor(idx / 26) - 1) + String.fromCharCode(65 + (idx % 26))
    return {
      ...def,
      col: colLetter
    }
  })
}

export const COLUMNS: ColumnDef[] = buildColumnsWithLetters(DEFAULT_COLUMN_DEFS.map(c => c.id))


/* ─── Cleaner Color Block Palettes (Rich Solid Background & Distinct Perimeter Borders) ─── */
export interface BlockPalette {
  id: string
  name: string
  headerBg: string
  headerText: string
  badgeBg: string
  badgeText: string
  rowBg: string
  rowBorder: string
  borderLeft: string
  avatarBg: string
  hex: string
  solidBg: string
  solidBorder: string
  hoverBg: string
  isLight?: boolean
}

export const BLOCK_PALETTES: Record<string, BlockPalette> = {
  emerald: {
    id: 'emerald',
    name: 'Emerald Forest',
    headerBg: 'bg-emerald-900',
    headerText: 'text-white',
    badgeBg: 'bg-emerald-800',
    badgeText: 'text-emerald-100',
    rowBg: 'bg-[#064e3b]',
    rowBorder: 'border-emerald-500',
    borderLeft: 'border-l-[5px] border-l-emerald-500',
    avatarBg: 'bg-emerald-700 text-white',
    hex: '#10b981',
    solidBg: '#064e3b',
    solidBorder: '#10b981',
    hoverBg: '#065f46',
  },
  sky: {
    id: 'sky',
    name: 'Midnight Navy',
    headerBg: 'bg-blue-950',
    headerText: 'text-white',
    badgeBg: 'bg-blue-800',
    badgeText: 'text-blue-100',
    rowBg: 'bg-[#0f244a]',
    rowBorder: 'border-blue-500',
    borderLeft: 'border-l-[5px] border-l-blue-500',
    avatarBg: 'bg-blue-700 text-white',
    hex: '#3b82f6',
    solidBg: '#0f244a',
    solidBorder: '#3b82f6',
    hoverBg: '#1e3a8a',
  },
  violet: {
    id: 'violet',
    name: 'Royal Violet',
    headerBg: 'bg-purple-950',
    headerText: 'text-white',
    badgeBg: 'bg-purple-800',
    badgeText: 'text-purple-100',
    rowBg: 'bg-[#3b0764]',
    rowBorder: 'border-purple-500',
    borderLeft: 'border-l-[5px] border-l-purple-500',
    avatarBg: 'bg-purple-700 text-white',
    hex: '#a855f7',
    solidBg: '#3b0764',
    solidBorder: '#a855f7',
    hoverBg: '#581c87',
  },
  amber: {
    id: 'amber',
    name: 'Dark Amber',
    headerBg: 'bg-amber-950',
    headerText: 'text-white',
    badgeBg: 'bg-amber-800',
    badgeText: 'text-amber-100',
    rowBg: 'bg-[#451a03]',
    rowBorder: 'border-amber-500',
    borderLeft: 'border-l-[5px] border-l-amber-500',
    avatarBg: 'bg-amber-700 text-white',
    hex: '#f59e0b',
    solidBg: '#451a03',
    solidBorder: '#f59e0b',
    hoverBg: '#78350f',
  },
  teal: {
    id: 'teal',
    name: 'Peacock Teal',
    headerBg: 'bg-teal-950',
    headerText: 'text-white',
    badgeBg: 'bg-teal-800',
    badgeText: 'text-teal-100',
    rowBg: 'bg-[#042f2e]',
    rowBorder: 'border-teal-500',
    borderLeft: 'border-l-[5px] border-l-teal-500',
    avatarBg: 'bg-teal-700 text-white',
    hex: '#14b8a6',
    solidBg: '#042f2e',
    solidBorder: '#14b8a6',
    hoverBg: '#115e59',
  },
  indigo: {
    id: 'indigo',
    name: 'Rich Indigo',
    headerBg: 'bg-indigo-950',
    headerText: 'text-white',
    badgeBg: 'bg-indigo-800',
    badgeText: 'text-indigo-100',
    rowBg: 'bg-[#1e1b4b]',
    rowBorder: 'border-indigo-500',
    borderLeft: 'border-l-[5px] border-l-indigo-500',
    avatarBg: 'bg-indigo-700 text-white',
    hex: '#6366f1',
    solidBg: '#1e1b4b',
    solidBorder: '#6366f1',
    hoverBg: '#312e81',
  },
  rose: {
    id: 'rose',
    name: 'Deep Crimson',
    headerBg: 'bg-rose-950',
    headerText: 'text-white',
    badgeBg: 'bg-rose-800',
    badgeText: 'text-rose-100',
    rowBg: 'bg-[#4c0519]',
    rowBorder: 'border-rose-500',
    borderLeft: 'border-l-[5px] border-l-rose-500',
    avatarBg: 'bg-rose-700 text-white',
    hex: '#f43f5e',
    solidBg: '#4c0519',
    solidBorder: '#f43f5e',
    hoverBg: '#881337',
  },
  orange: {
    id: 'orange',
    name: 'Burnt Rust',
    headerBg: 'bg-orange-950',
    headerText: 'text-white',
    badgeBg: 'bg-orange-800',
    badgeText: 'text-orange-100',
    rowBg: 'bg-[#431407]',
    rowBorder: 'border-orange-500',
    borderLeft: 'border-l-[5px] border-l-orange-500',
    avatarBg: 'bg-orange-700 text-white',
    hex: '#f97316',
    solidBg: '#431407',
    solidBorder: '#f97316',
    hoverBg: '#7c2d12',
  },
  slate: {
    id: 'slate',
    name: 'Charcoal Slate',
    headerBg: 'bg-slate-900',
    headerText: 'text-white',
    badgeBg: 'bg-slate-800',
    badgeText: 'text-slate-100',
    rowBg: 'bg-[#0f172a]',
    rowBorder: 'border-slate-500',
    borderLeft: 'border-l-[5px] border-l-slate-500',
    avatarBg: 'bg-slate-700 text-white',
    hex: '#94a3b8',
    solidBg: '#0f172a',
    solidBorder: '#94a3b8',
    hoverBg: '#1e293b',
  },
  plum: {
    id: 'plum',
    name: 'Imperial Plum',
    headerBg: 'bg-fuchsia-950',
    headerText: 'text-white',
    badgeBg: 'bg-fuchsia-800',
    badgeText: 'text-fuchsia-100',
    rowBg: 'bg-[#4a044e]',
    rowBorder: 'border-fuchsia-500',
    borderLeft: 'border-l-[5px] border-l-fuchsia-500',
    avatarBg: 'bg-fuchsia-700 text-white',
    hex: '#d946ef',
    solidBg: '#4a044e',
    solidBorder: '#d946ef',
    hoverBg: '#701a75',
  },
  cobalt: {
    id: 'cobalt',
    name: 'Ocean Cobalt',
    headerBg: 'bg-blue-900',
    headerText: 'text-white',
    badgeBg: 'bg-blue-800',
    badgeText: 'text-blue-100',
    rowBg: 'bg-[#172554]',
    rowBorder: 'border-blue-400',
    borderLeft: 'border-l-[5px] border-l-blue-400',
    avatarBg: 'bg-blue-600 text-white',
    hex: '#2563eb',
    solidBg: '#172554',
    solidBorder: '#60a5fa',
    hoverBg: '#1e3a8a',
  },
  bronze: {
    id: 'bronze',
    name: 'Antique Bronze',
    headerBg: 'bg-yellow-950',
    headerText: 'text-white',
    badgeBg: 'bg-yellow-800',
    badgeText: 'text-yellow-100',
    rowBg: 'bg-[#3a1d04]',
    rowBorder: 'border-yellow-500',
    borderLeft: 'border-l-[5px] border-l-yellow-500',
    avatarBg: 'bg-yellow-700 text-white',
    hex: '#ca8a04',
    solidBg: '#3a1d04',
    solidBorder: '#eab308',
    hoverBg: '#713f12',
  },
  olive: {
    id: 'olive',
    name: 'Military Olive',
    headerBg: 'bg-lime-950',
    headerText: 'text-white',
    badgeBg: 'bg-lime-800',
    badgeText: 'text-lime-100',
    rowBg: 'bg-[#1a2e05]',
    rowBorder: 'border-lime-500',
    borderLeft: 'border-l-[5px] border-l-lime-500',
    avatarBg: 'bg-lime-700 text-white',
    hex: '#84cc16',
    solidBg: '#1a2e05',
    solidBorder: '#84cc16',
    hoverBg: '#3f6212',
  },
  cyan: {
    id: 'cyan',
    name: 'Aegean Cyan',
    headerBg: 'bg-cyan-950',
    headerText: 'text-white',
    badgeBg: 'bg-cyan-800',
    badgeText: 'text-cyan-100',
    rowBg: 'bg-[#083344]',
    rowBorder: 'border-cyan-500',
    borderLeft: 'border-l-[5px] border-l-cyan-500',
    avatarBg: 'bg-cyan-700 text-white',
    hex: '#06b6d4',
    solidBg: '#083344',
    solidBorder: '#06b6d4',
    hoverBg: '#155e75',
  },
  onyx: {
    id: 'onyx',
    name: 'Midnight Onyx',
    headerBg: 'bg-zinc-900',
    headerText: 'text-white',
    badgeBg: 'bg-zinc-800',
    badgeText: 'text-zinc-100',
    rowBg: 'bg-[#18181b]',
    rowBorder: 'border-zinc-500',
    borderLeft: 'border-l-[5px] border-l-zinc-500',
    avatarBg: 'bg-zinc-700 text-white',
    hex: '#71717a',
    solidBg: '#18181b',
    solidBorder: '#a1a1aa',
    hoverBg: '#27272a',
  },
  burgundy: {
    id: 'burgundy',
    name: 'Wine Burgundy',
    headerBg: 'bg-red-950',
    headerText: 'text-white',
    badgeBg: 'bg-red-800',
    badgeText: 'text-red-100',
    rowBg: 'bg-[#450a0a]',
    rowBorder: 'border-red-500',
    borderLeft: 'border-l-[5px] border-l-red-500',
    avatarBg: 'bg-red-700 text-white',
    hex: '#dc2626',
    solidBg: '#450a0a',
    solidBorder: '#ef4444',
    hoverBg: '#7f1d1d',
  },
  pine: {
    id: 'pine',
    name: 'Nordic Pine',
    headerBg: 'bg-green-950',
    headerText: 'text-white',
    badgeBg: 'bg-green-800',
    badgeText: 'text-green-100',
    rowBg: 'bg-[#052e16]',
    rowBorder: 'border-green-500',
    borderLeft: 'border-l-[5px] border-l-green-500',
    avatarBg: 'bg-green-700 text-white',
    hex: '#22c55e',
    solidBg: '#052e16',
    solidBorder: '#22c55e',
    hoverBg: '#14532d',
  },
  electric: {
    id: 'electric',
    name: 'Electric Indigo',
    headerBg: 'bg-indigo-900',
    headerText: 'text-white',
    badgeBg: 'bg-indigo-800',
    badgeText: 'text-indigo-100',
    rowBg: 'bg-[#232066]',
    rowBorder: 'border-indigo-400',
    borderLeft: 'border-l-[5px] border-l-indigo-400',
    avatarBg: 'bg-indigo-600 text-white',
    hex: '#818cf8',
    solidBg: '#232066',
    solidBorder: '#818cf8',
    hoverBg: '#3730a3',
  },
  mulberry: {
    id: 'mulberry',
    name: 'Wild Mulberry',
    headerBg: 'bg-pink-950',
    headerText: 'text-white',
    badgeBg: 'bg-pink-800',
    badgeText: 'text-pink-100',
    rowBg: 'bg-[#360518]',
    rowBorder: 'border-pink-500',
    borderLeft: 'border-l-[5px] border-l-pink-500',
    avatarBg: 'bg-pink-700 text-white',
    hex: '#ec4899',
    solidBg: '#360518',
    solidBorder: '#f472b6',
    hoverBg: '#831843',
  },
  gunmetal: {
    id: 'gunmetal',
    name: 'Gunmetal Steel',
    headerBg: 'bg-gray-900',
    headerText: 'text-white',
    badgeBg: 'bg-gray-800',
    badgeText: 'text-gray-100',
    rowBg: 'bg-[#111827]',
    rowBorder: 'border-gray-500',
    borderLeft: 'border-l-[5px] border-l-gray-500',
    avatarBg: 'bg-gray-700 text-white',
    hex: '#9ca3af',
    solidBg: '#111827',
    solidBorder: '#9ca3af',
    hoverBg: '#1f2937',
  },

  /* ─── 20 Light Color Styles (Soft Pastels with Solid Matching Borders) ─── */
  emerald_light: {
    id: 'emerald_light',
    name: 'Emerald Mint',
    isLight: true,
    headerBg: 'bg-emerald-600',
    headerText: 'text-white',
    badgeBg: 'bg-emerald-100',
    badgeText: 'text-emerald-900',
    rowBg: 'bg-[#d1fae5]',
    rowBorder: 'border-emerald-300',
    borderLeft: 'border-l-[5px] border-l-emerald-600',
    avatarBg: 'bg-emerald-700 text-white',
    hex: '#059669',
    solidBg: '#d1fae5',
    solidBorder: '#059669',
    hoverBg: '#a7f3d0',
  },
  sky_light: {
    id: 'sky_light',
    name: 'Sky Pastel',
    isLight: true,
    headerBg: 'bg-sky-600',
    headerText: 'text-white',
    badgeBg: 'bg-sky-100',
    badgeText: 'text-sky-900',
    rowBg: 'bg-[#e0f2fe]',
    rowBorder: 'border-sky-300',
    borderLeft: 'border-l-[5px] border-l-sky-600',
    avatarBg: 'bg-sky-700 text-white',
    hex: '#0284c7',
    solidBg: '#e0f2fe',
    solidBorder: '#0284c7',
    hoverBg: '#bae6fd',
  },
  violet_light: {
    id: 'violet_light',
    name: 'Violet Lilac',
    isLight: true,
    headerBg: 'bg-purple-600',
    headerText: 'text-white',
    badgeBg: 'bg-purple-100',
    badgeText: 'text-purple-900',
    rowBg: 'bg-[#ede9fe]',
    rowBorder: 'border-purple-300',
    borderLeft: 'border-l-[5px] border-l-purple-600',
    avatarBg: 'bg-purple-700 text-white',
    hex: '#7c3aed',
    solidBg: '#ede9fe',
    solidBorder: '#7c3aed',
    hoverBg: '#ddd6fe',
  },
  amber_light: {
    id: 'amber_light',
    name: 'Amber Cream',
    isLight: true,
    headerBg: 'bg-amber-600',
    headerText: 'text-white',
    badgeBg: 'bg-amber-100',
    badgeText: 'text-amber-900',
    rowBg: 'bg-[#fef3c7]',
    rowBorder: 'border-amber-300',
    borderLeft: 'border-l-[5px] border-l-amber-500',
    avatarBg: 'bg-amber-700 text-white',
    hex: '#d97706',
    solidBg: '#fef3c7',
    solidBorder: '#d97706',
    hoverBg: '#fde68a',
  },
  teal_light: {
    id: 'teal_light',
    name: 'Teal Aqua',
    isLight: true,
    headerBg: 'bg-teal-600',
    headerText: 'text-white',
    badgeBg: 'bg-teal-100',
    badgeText: 'text-teal-900',
    rowBg: 'bg-[#ccfbf1]',
    rowBorder: 'border-teal-300',
    borderLeft: 'border-l-[5px] border-l-teal-600',
    avatarBg: 'bg-teal-700 text-white',
    hex: '#0d9488',
    solidBg: '#ccfbf1',
    solidBorder: '#0d9488',
    hoverBg: '#99f6e4',
  },
  indigo_light: {
    id: 'indigo_light',
    name: 'Indigo Ice',
    isLight: true,
    headerBg: 'bg-indigo-600',
    headerText: 'text-white',
    badgeBg: 'bg-indigo-100',
    badgeText: 'text-indigo-900',
    rowBg: 'bg-[#e0e7ff]',
    rowBorder: 'border-indigo-300',
    borderLeft: 'border-l-[5px] border-l-indigo-600',
    avatarBg: 'bg-indigo-700 text-white',
    hex: '#4f46e5',
    solidBg: '#e0e7ff',
    solidBorder: '#4f46e5',
    hoverBg: '#c7d2fe',
  },
  rose_light: {
    id: 'rose_light',
    name: 'Rose Blush',
    isLight: true,
    headerBg: 'bg-rose-600',
    headerText: 'text-white',
    badgeBg: 'bg-rose-100',
    badgeText: 'text-rose-900',
    rowBg: 'bg-[#ffe4e6]',
    rowBorder: 'border-rose-300',
    borderLeft: 'border-l-[5px] border-l-rose-600',
    avatarBg: 'bg-rose-700 text-white',
    hex: '#e11d48',
    solidBg: '#ffe4e6',
    solidBorder: '#e11d48',
    hoverBg: '#fecdd3',
  },
  orange_light: {
    id: 'orange_light',
    name: 'Peach Apricot',
    isLight: true,
    headerBg: 'bg-orange-600',
    headerText: 'text-white',
    badgeBg: 'bg-orange-100',
    badgeText: 'text-orange-900',
    rowBg: 'bg-[#ffedd5]',
    rowBorder: 'border-orange-300',
    borderLeft: 'border-l-[5px] border-l-orange-500',
    avatarBg: 'bg-orange-700 text-white',
    hex: '#ea580c',
    solidBg: '#ffedd5',
    solidBorder: '#ea580c',
    hoverBg: '#fed7aa',
  },
  slate_light: {
    id: 'slate_light',
    name: 'Slate Mist',
    isLight: true,
    headerBg: 'bg-slate-600',
    headerText: 'text-white',
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-900',
    rowBg: 'bg-[#f1f5f9]',
    rowBorder: 'border-slate-300',
    borderLeft: 'border-l-[5px] border-l-slate-600',
    avatarBg: 'bg-slate-700 text-white',
    hex: '#475569',
    solidBg: '#f1f5f9',
    solidBorder: '#475569',
    hoverBg: '#e2e8f0',
  },
  plum_light: {
    id: 'plum_light',
    name: 'Plum Orchid',
    isLight: true,
    headerBg: 'bg-fuchsia-600',
    headerText: 'text-white',
    badgeBg: 'bg-fuchsia-100',
    badgeText: 'text-fuchsia-900',
    rowBg: 'bg-[#fae8ff]',
    rowBorder: 'border-fuchsia-300',
    borderLeft: 'border-l-[5px] border-l-fuchsia-600',
    avatarBg: 'bg-fuchsia-700 text-white',
    hex: '#c026d3',
    solidBg: '#fae8ff',
    solidBorder: '#c026d3',
    hoverBg: '#f5d0fe',
  },
  cobalt_light: {
    id: 'cobalt_light',
    name: 'Cobalt Azure',
    isLight: true,
    headerBg: 'bg-blue-600',
    headerText: 'text-white',
    badgeBg: 'bg-blue-100',
    badgeText: 'text-blue-900',
    rowBg: 'bg-[#dbeafe]',
    rowBorder: 'border-blue-300',
    borderLeft: 'border-l-[5px] border-l-blue-600',
    avatarBg: 'bg-blue-700 text-white',
    hex: '#2563eb',
    solidBg: '#dbeafe',
    solidBorder: '#2563eb',
    hoverBg: '#bfdbfe',
  },
  bronze_light: {
    id: 'bronze_light',
    name: 'Bronze Sand',
    isLight: true,
    headerBg: 'bg-yellow-600',
    headerText: 'text-white',
    badgeBg: 'bg-yellow-100',
    badgeText: 'text-yellow-900',
    rowBg: 'bg-[#fef9c3]',
    rowBorder: 'border-yellow-300',
    borderLeft: 'border-l-[5px] border-l-yellow-600',
    avatarBg: 'bg-yellow-700 text-white',
    hex: '#ca8a04',
    solidBg: '#fef9c3',
    solidBorder: '#ca8a04',
    hoverBg: '#fef08a',
  },
  olive_light: {
    id: 'olive_light',
    name: 'Olive Pistachio',
    isLight: true,
    headerBg: 'bg-lime-600',
    headerText: 'text-white',
    badgeBg: 'bg-lime-100',
    badgeText: 'text-lime-900',
    rowBg: 'bg-[#ecfccb]',
    rowBorder: 'border-lime-300',
    borderLeft: 'border-l-[5px] border-l-lime-600',
    avatarBg: 'bg-lime-700 text-white',
    hex: '#65a30d',
    solidBg: '#ecfccb',
    solidBorder: '#65a30d',
    hoverBg: '#d9f99d',
  },
  cyan_light: {
    id: 'cyan_light',
    name: 'Cyan Tiffany',
    isLight: true,
    headerBg: 'bg-cyan-600',
    headerText: 'text-white',
    badgeBg: 'bg-cyan-100',
    badgeText: 'text-cyan-900',
    rowBg: 'bg-[#cffafe]',
    rowBorder: 'border-cyan-300',
    borderLeft: 'border-l-[5px] border-l-cyan-600',
    avatarBg: 'bg-cyan-700 text-white',
    hex: '#0891b2',
    solidBg: '#cffafe',
    solidBorder: '#0891b2',
    hoverBg: '#a5f3fc',
  },
  onyx_light: {
    id: 'onyx_light',
    name: 'Pearl Silver',
    isLight: true,
    headerBg: 'bg-zinc-600',
    headerText: 'text-white',
    badgeBg: 'bg-zinc-100',
    badgeText: 'text-zinc-900',
    rowBg: 'bg-[#f4f4f5]',
    rowBorder: 'border-zinc-300',
    borderLeft: 'border-l-[5px] border-l-zinc-600',
    avatarBg: 'bg-zinc-700 text-white',
    hex: '#52525b',
    solidBg: '#f4f4f5',
    solidBorder: '#52525b',
    hoverBg: '#e4e4e7',
  },
  burgundy_light: {
    id: 'burgundy_light',
    name: 'Coral Salmon',
    isLight: true,
    headerBg: 'bg-red-600',
    headerText: 'text-white',
    badgeBg: 'bg-red-100',
    badgeText: 'text-red-900',
    rowBg: 'bg-[#fee2e2]',
    rowBorder: 'border-red-300',
    borderLeft: 'border-l-[5px] border-l-red-600',
    avatarBg: 'bg-red-700 text-white',
    hex: '#dc2626',
    solidBg: '#fee2e2',
    solidBorder: '#dc2626',
    hoverBg: '#fecaca',
  },
  pine_light: {
    id: 'pine_light',
    name: 'Pine Sage',
    isLight: true,
    headerBg: 'bg-green-600',
    headerText: 'text-white',
    badgeBg: 'bg-green-100',
    badgeText: 'text-green-900',
    rowBg: 'bg-[#dcfce7]',
    rowBorder: 'border-green-300',
    borderLeft: 'border-l-[5px] border-l-green-600',
    avatarBg: 'bg-green-700 text-white',
    hex: '#16a34a',
    solidBg: '#dcfce7',
    solidBorder: '#16a34a',
    hoverBg: '#bbf7d0',
  },
  electric_light: {
    id: 'electric_light',
    name: 'Electric Pastel',
    isLight: true,
    headerBg: 'bg-indigo-500',
    headerText: 'text-white',
    badgeBg: 'bg-indigo-100',
    badgeText: 'text-indigo-900',
    rowBg: 'bg-[#e0e7ff]',
    rowBorder: 'border-indigo-300',
    borderLeft: 'border-l-[5px] border-l-indigo-500',
    avatarBg: 'bg-indigo-600 text-white',
    hex: '#6366f1',
    solidBg: '#e0e7ff',
    solidBorder: '#6366f1',
    hoverBg: '#c7d2fe',
  },
  mulberry_light: {
    id: 'mulberry_light',
    name: 'Mulberry Pink',
    isLight: true,
    headerBg: 'bg-pink-600',
    headerText: 'text-white',
    badgeBg: 'bg-pink-100',
    badgeText: 'text-pink-900',
    rowBg: 'bg-[#fce7f3]',
    rowBorder: 'border-pink-300',
    borderLeft: 'border-l-[5px] border-l-pink-600',
    avatarBg: 'bg-pink-700 text-white',
    hex: '#db2777',
    solidBg: '#fce7f3',
    solidBorder: '#db2777',
    hoverBg: '#fbcfe8',
  },
  gunmetal_light: {
    id: 'gunmetal_light',
    name: 'Gunmetal Cloud',
    isLight: true,
    headerBg: 'bg-gray-600',
    headerText: 'text-white',
    badgeBg: 'bg-gray-100',
    badgeText: 'text-gray-900',
    rowBg: 'bg-[#f3f4f6]',
    rowBorder: 'border-gray-300',
    borderLeft: 'border-l-[5px] border-l-gray-600',
    avatarBg: 'bg-gray-700 text-white',
    hex: '#4b5563',
    solidBg: '#f3f4f6',
    solidBorder: '#4b5563',
    hoverBg: '#e5e7eb',
  },
}

export const SOLID_PALETTE_KEYS = [
  'emerald', 'sky', 'violet', 'amber', 'teal', 'indigo', 'rose', 'orange', 'slate', 'plum',
  'cobalt', 'bronze', 'olive', 'cyan', 'onyx', 'burgundy', 'pine', 'electric', 'mulberry', 'gunmetal'
]

export const LIGHT_PALETTE_KEYS = [
  'emerald_light', 'sky_light', 'violet_light', 'amber_light', 'teal_light', 'indigo_light', 'rose_light', 'orange_light', 'slate_light', 'plum_light',
  'cobalt_light', 'bronze_light', 'olive_light', 'cyan_light', 'onyx_light', 'burgundy_light', 'pine_light', 'electric_light', 'mulberry_light', 'gunmetal_light'
]

const PALETTE_KEYS = Object.keys(BLOCK_PALETTES)

// ── Safe save helpers (AUD-49, UX-33, UX-34) ──
const SAVED_FIELDS = [
  'date', 'staff_name', 'start_time', 'end_time', 'duty_hours', 'ot_hours', 'address', 'area',
  'charges', 'received', 'payment_mode', 'material', 'service', 'remarks',
] as const
const NUMERIC_FIELDS = new Set<string>(['duty_hours', 'ot_hours', 'charges', 'received'])
const fieldValue = (row: DailyJob, k: (typeof SAVED_FIELDS)[number]) =>
  NUMERIC_FIELDS.has(k) ? cleanNum(row[k]) : String(row[k] ?? '').trim()
/** True when the two rows hold the same saved values */
const sameJobRow = (a: DailyJob, b: DailyJob) => SAVED_FIELDS.every(k => fieldValue(a, k) === fieldValue(b, k))
/** A new grid row the user never filled in — not worth saving */
const isBlankNewRow = (r: DailyJob) =>
  !String(r.address || '').trim() && !String(r.area || '').trim() && cleanNum(r.charges) === 0 &&
  cleanNum(r.received) === 0 && !String(r.service || '').trim() && !String(r.remarks || '').trim()
const DRAFT_PREFIX = 'safaeewala_excel_draft:' // local only, never cloud-synced

/** Column presets (UX-39) — the columns each preset shows */
const COLUMN_PRESETS: Record<string, string[] | null> = {
  'All columns': null,
  Cashier: ['date', 'staff_name', 'address', 'charges', 'received', 'pending', 'payment_mode', 'remarks'],
  Payroll: ['date', 'staff_name', 'start_time', 'end_time', 'duty_hours', 'ot_hours', 'remarks'],
  Ops: ['date', 'staff_name', 'start_time', 'end_time', 'address', 'area', 'service', 'material', 'remarks'],
}
/** Temporary id for a grid row that is not saved yet */
const newRowId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
/** Columns that are calculated, never typed into */
const READ_ONLY_COLS = new Set(['pending'])
/** Cell editor → datalist id (UX-35) */
const AUTOCOMPLETE_LIST: Record<string, string> = { staff_name: 'xl-staff', address: 'xl-address', area: 'xl-area', service: 'xl-service' }
/** Rows drawn at once in long periods (AUD-56, UX-38) */
const RENDER_PAGE = 300

function safeGet<T>(key: string, fallback: T): T {
  try {
    const val = localStorage.getItem(key)
    return val ? JSON.parse(val) : fallback
  } catch {
    return fallback
  }
}

function safeSet(key: string, value: any) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {}
}

/* ─── Excel Formula Parser & Evaluator ─── */
function evaluateFormula(
  formulaStr: string,
  gridData: Record<string, any>[],
  currentRowIdx: number,
  activeColumns: ColumnDef[] = COLUMNS
): number | string {
  const expr = formulaStr.trim()
  if (!expr.startsWith('=')) return expr

  const body = expr.substring(1).trim().toUpperCase()

  // 1. =SUM(ColRange) e.g. =SUM(I2:I20) or =SUM(I)
  const sumMatch = body.match(/^SUM\(([A-Z]+)(\d+)?(?::([A-Z]+)(\d+)?)?\)$/i)
  if (sumMatch) {
    const startColLetter = sumMatch[1].toUpperCase()
    const startRow = sumMatch[2] ? parseInt(sumMatch[2], 10) - 1 : 0
    const endRow = sumMatch[4] ? parseInt(sumMatch[4], 10) - 1 : gridData.length - 1

    const colDef = activeColumns.find(c => c.col === startColLetter)
    if (!colDef) return 0

    let total = 0
    for (let r = Math.max(0, startRow); r <= Math.min(gridData.length - 1, endRow); r++) {
      const val = cleanNum(gridData[r]?.[colDef.id])
      total += val
    }
    return Math.round(total * 100) / 100
  }

  // 2. =AVERAGE(ColRange)
  const avgMatch = body.match(/^AVERAGE\(([A-Z]+)(\d+)?(?::([A-Z]+)(\d+)?)?\)$/i)
  if (avgMatch) {
    const colLetter = avgMatch[1].toUpperCase()
    const startRow = avgMatch[2] ? parseInt(avgMatch[2], 10) - 1 : 0
    const endRow = avgMatch[4] ? parseInt(avgMatch[4], 10) - 1 : gridData.length - 1
    const colDef = activeColumns.find(c => c.col === colLetter)
    if (!colDef) return 0

    let total = 0
    let count = 0
    for (let r = Math.max(0, startRow); r <= Math.min(gridData.length - 1, endRow); r++) {
      const val = cleanNum(gridData[r]?.[colDef.id])
      total += val
      count++
    }
    return count > 0 ? Math.round((total / count) * 100) / 100 : 0
  }

  // 3. =COUNT(ColRange)
  const countMatch = body.match(/^COUNT\(([A-Z]+)(\d+)?(?::([A-Z]+)(\d+)?)?\)$/i)
  if (countMatch) {
    const colLetter = countMatch[1].toUpperCase()
    const startRow = countMatch[2] ? parseInt(countMatch[2], 10) - 1 : 0
    const endRow = countMatch[4] ? parseInt(countMatch[4], 10) - 1 : gridData.length - 1
    const colDef = activeColumns.find(c => c.col === colLetter)
    if (!colDef) return 0

    let count = 0
    for (let r = Math.max(0, startRow); r <= Math.min(gridData.length - 1, endRow); r++) {
      if (gridData[r]?.[colDef.id] !== undefined && gridData[r]?.[colDef.id] !== '') count++
    }
    return count
  }

  // 4. Simple cell references like =I4 - J4 or =I - J (relative to current row)
  try {
    let parsedExpr = body.replace(/([A-Z]+)(\d+)/g, (_, colLtr, rowNum) => {
      const col = activeColumns.find(c => c.col === colLtr.toUpperCase())
      const rIdx = parseInt(rowNum, 10) - 1
      if (!col || !gridData[rIdx]) return '0'
      const v = cleanNum(gridData[rIdx][col.id])
      return String(v)
    })

    parsedExpr = parsedExpr.replace(/\b([A-Z])\b/g, (_, colLtr) => {
      const col = activeColumns.find(c => c.col === colLtr.toUpperCase())
      if (!col || !gridData[currentRowIdx]) return '0'
      const v = cleanNum(gridData[currentRowIdx][col.id])
      return String(v)
    })

    if (/^[0-9+\-*/().\s]+$/.test(parsedExpr)) {
      // eslint-disable-next-line no-eval
      const result = Function(`'use strict'; return (${parsedExpr})`)()
      return typeof result === 'number' && !isNaN(result) ? Math.round(result * 100) / 100 : 0
    }
  } catch (err) {
    return '#VALUE!'
  }

  return '#ERROR!'
}

export function JobSheetSpreadsheet() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { dailyJobs, clients, employees, invoices, addDailyJob, updateDailyJob, deleteDailyJob } = useData()

  // ── Target Date Selection & Dynamic Filters ──
  const qDate = searchParams.get('date')
  const initialDate = qDate && /^\d{4}-\d{2}-\d{2}$/.test(qDate)
    ? qDate
    : todayDubai()
  const [selectedDate, setSelectedDate] = useState(initialDate)
  const [dateFilterMode, setDateFilterMode] = useState<'single' | 'today' | 'yesterday' | 'range' | 'all'>('single')
  const [rangeStart, setRangeStart] = useState<string>(initialDate)
  const [rangeEnd, setRangeEnd] = useState<string>(initialDate)

  // ── Weekly Schedule ↔ Daily Job Sheet Synchronization State ──
  const [showMonthlySyncModal, setShowMonthlySyncModal] = useState(false)
  const [autoSyncMonthly, setAutoSyncMonthly] = useState<boolean>(() => {
    return safeLocalStorageGet('safaeewala_auto_sync_monthly_schedules', true)
  })
  const autoSyncedDatesRef = useRef<Set<string>>(new Set())

  const effectiveTargetDate = useMemo(() => {
    if (dateFilterMode === 'today') return todayDubai()
    if (dateFilterMode === 'yesterday') return addDaysToYMD(todayDubai(), -1)
    return selectedDate
  }, [selectedDate, dateFilterMode])

  const monthlySyncStatus = useMemo(() => {
    if (dateFilterMode !== 'single' && dateFilterMode !== 'today' && dateFilterMode !== 'yesterday') {
      return { totalScheduled: 0, alreadySyncedCount: 0, pendingSyncCount: 0, dayName: 'Monday' as const, shifts: [] }
    }
    return getScheduledMonthlyShiftsForDate(effectiveTargetDate, clients, dailyJobs)
  }, [effectiveTargetDate, dateFilterMode, clients, dailyJobs])

  // Auto-fetch repeating schedules for the target date if enabled
  useEffect(() => {
    if (!autoSyncMonthly) return
    if (dateFilterMode !== 'single' && dateFilterMode !== 'today' && dateFilterMode !== 'yesterday') return
    if (autoSyncedDatesRef.current.has(effectiveTargetDate)) return

    if (monthlySyncStatus.pendingSyncCount > 0) {
      autoSyncedDatesRef.current.add(effectiveTargetDate)
      const res = syncMonthlySchedulesToDailyJobs(effectiveTargetDate, clients, dailyJobs, addDailyJob)
      if (res.insertedCount > 0) {
        setToastMessage(`⚡ Auto-Fetched ${res.insertedCount} Monthly Client Shifts (${res.dayName})`)
        setTimeout(() => setToastMessage(null), 3500)
      }
    }
  }, [effectiveTargetDate, autoSyncMonthly, dateFilterMode, monthlySyncStatus.pendingSyncCount, clients, dailyJobs, addDailyJob])

  const handleSyncAllMonthlyShifts = () => {
    const res = syncMonthlySchedulesToDailyJobs(effectiveTargetDate, clients, dailyJobs, addDailyJob)
    if (res.insertedCount > 0) {
      setToastMessage(`⚡ Fetched ${res.insertedCount} Monthly Client Shifts (${res.dayName})`)
      setTimeout(() => setToastMessage(null), 3500)
    }
    setShowMonthlySyncModal(false)
  }

  const handleSyncSingleShift = (shift: ScheduledShiftPlan) => {
    addDailyJob({
      date: effectiveTargetDate,
      staff_name: shift.cleanerName,
      start_time: shift.startTime,
      end_time: shift.endTime,
      duty_hours: shift.durationHours,
      ot_hours: 0,
      address: shift.address,
      area: shift.area,
      material: 'No',
      charges: shift.charges,
      received: 0,
      payment_mode: 'Monthly',
      is_overtime: false,
      remarks: shift.remarks,
      service: shift.service,
    })
  }

  // ── Drag & Drop Column Sequence (Persisted in localStorage) ──
  const [columnOrder, setColumnOrder] = useState<string[]>(() => {
    const defaultList = DEFAULT_COLUMN_DEFS.map(c => c.id)
    const saved = safeLocalStorageGet<string[]>('safaeewala_excel_columns_order', [])
    if (!Array.isArray(saved) || saved.length === 0) return defaultList
    const valid = saved.filter(id => defaultList.includes(id as any))
    defaultList.forEach(id => {
      if (!valid.includes(id)) valid.push(id)
    })
    return valid
  })

  // ── Column Visibility State (Persisted in localStorage) ──
  const [hiddenColIds, setHiddenColIds] = useState<string[]>(() => {
    return safeLocalStorageGet<string[]>('safaeewala_excel_hidden_columns', [])
  })

  // ── Column Customization Modal State ──
  const [showColumnsModal, setShowColumnsModal] = useState(false)
  const [modalDragId, setModalDragId] = useState<string | null>(null)
  const [modalDragOverId, setModalDragOverId] = useState<string | null>(null)

  const columns = useMemo(() => {
    return buildColumnsWithLetters(columnOrder, hiddenColIds)
  }, [columnOrder, hiddenColIds])

  // Row history (UX-40) — from audit_log
  const [rowHistory, setRowHistory] = useState<{ label: string; loading: boolean; entries: AuditEntry[] } | null>(null)
  const openRowHistory = (job: DailyJob) => {
    setContextMenu(null)
    const label = `${job.staff_name || '—'} · ${job.date}`
    setRowHistory({ label, loading: true, entries: [] })
    void fetchRecordHistory(job.id).then(entries => setRowHistory(h => (h && h.label === label ? { label, loading: false, entries } : h)))
  }

  /** UX-39: show only the columns a role needs */
  const applyColumnPreset = (name: string) => {
    const keep = COLUMN_PRESETS[name]
    const next = keep ? DEFAULT_COLUMN_DEFS.map(c => c.id as string).filter(id => !keep.includes(id)) : []
    setHiddenColIds(next)
    safeLocalStorageSet('safaeewala_excel_hidden_columns', next)
    showToast(`Columns: ${name}`)
  }

  // Autocomplete sources (UX-35) — live data only
  const staffOptions = useMemo(() => employees.filter(e => e.status !== 'inactive' && e.full_name).map(e => e.full_name.trim()).sort((a, b) => a.localeCompare(b)), [employees])
  const addressOptions = useMemo(() => {
    const set = new Set<string>()
    getAssignableClients(clients).forEach(c => { if (c.full_name) set.add(c.full_name.trim()); if (c.building_name) set.add(c.building_name.trim()) })
    return Array.from(set).sort((a, b) => a.localeCompare(b)).slice(0, 1000)
  }, [clients])
  const areaOptions = useMemo(() => Array.from(new Set(dailyJobs.map(j => (j.area || '').trim()).filter(a => a && a !== '—'))).sort().slice(0, 300), [dailyJobs])
  const serviceOptions = useMemo(() => Array.from(new Set(dailyJobs.map(j => (j.service || '').trim()).filter(a => a && a !== '—'))).sort().slice(0, 200), [dailyJobs])

  const toggleColumnVisibility = (colId: string) => {
    setHiddenColIds(prev => {
      const next = prev.includes(colId) ? prev.filter(id => id !== colId) : [...prev, colId]
      safeLocalStorageSet('safaeewala_excel_hidden_columns', next)
      return next
    })
  }

  const showAllColumns = () => {
    setHiddenColIds([])
    safeLocalStorageSet('safaeewala_excel_hidden_columns', [])
    showToast('All columns are now visible')
  }

  const moveColumn = (fromIdx: number, direction: -1 | 1) => {
    const toIdx = fromIdx + direction
    if (toIdx < 0 || toIdx >= columnOrder.length) return
    setColumnOrder(prev => {
      const next = [...prev]
      const item = next[fromIdx]
      next.splice(fromIdx, 1)
      next.splice(toIdx, 0, item)
      safeLocalStorageSet('safaeewala_excel_columns_order', next)
      return next
    })
  }

  const handleModalDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('text/plain', id)
    setModalDragId(id)
  }

  const handleModalDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault()
    if (modalDragOverId !== id) {
      setModalDragOverId(id)
    }
  }

  const handleModalDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    const sourceId = modalDragId || e.dataTransfer.getData('text/plain')
    if (!sourceId || sourceId === targetId) {
      setModalDragId(null)
      setModalDragOverId(null)
      return
    }
    setColumnOrder(prev => {
      const next = [...prev]
      const fromIdx = next.indexOf(sourceId)
      const toIdx = next.indexOf(targetId)
      if (fromIdx < 0 || toIdx < 0) return prev
      next.splice(fromIdx, 1)
      next.splice(toIdx, 0, sourceId)
      safeLocalStorageSet('safaeewala_excel_columns_order', next)
      return next
    })
    setModalDragId(null)
    setModalDragOverId(null)
    showToast(`Column sequence updated!`)
  }

  const [draggedColId, setDraggedColId] = useState<string | null>(null)
  const [dragOverColId, setDragOverColId] = useState<string | null>(null)

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('text/plain', id)
    e.dataTransfer.effectAllowed = 'move'
    setDraggedColId(id)
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
    const sourceId = draggedColId || e.dataTransfer.getData('text/plain')
    if (!sourceId || sourceId === targetId) {
      setDraggedColId(null)
      setDragOverColId(null)
      return
    }
    setColumnOrder(prev => {
      const next = [...prev]
      const fromIdx = next.indexOf(sourceId)
      const toIdx = next.indexOf(targetId)
      if (fromIdx < 0 || toIdx < 0) return prev
      next.splice(fromIdx, 1)
      next.splice(toIdx, 0, sourceId)
      safeLocalStorageSet('safaeewala_excel_columns_order', next)
      return next
    })
    setDraggedColId(null)
    setDragOverColId(null)
    showToast(`Column order updated!`)
  }

  const resetColumnOrder = () => {
    const def = DEFAULT_COLUMN_DEFS.map(c => c.id)
    setColumnOrder(def)
    setHiddenColIds([])
    safeLocalStorageSet('safaeewala_excel_columns_order', def)
    safeLocalStorageSet('safaeewala_excel_hidden_columns', [])
    showToast('Columns reset to Daily Job Sheet default sequence and all made visible')
  }

  // ── Google Drive & Backup State ──
  const [showDriveModal, setShowDriveModal] = useState(false)
  const [driveStatus, setDriveStatus] = useState<'idle' | 'connecting' | 'uploading' | 'done' | 'error'>('idle')
  const [driveLink, setDriveLink] = useState('')
  const [driveError, setDriveError] = useState('')
  const [isBackingUp, setIsBackingUp] = useState(false)

  // ── Grid Data & History for Undo/Redo ──
  const [gridRows, setGridRows] = useState<DailyJob[]>([])
  // Shared pending formula (adjustments, advance deductions, later collections)
  const pendingCtx = useMemo(() => buildPendingCalcContext(), [])
  // Same receivable rule as the Job Sheet, Pending and Overview (AUD-53, R-FIN-05)
  const invoicedIds = useMemo(() => invoicedJobIds(invoices), [invoices])
  const rowPending = (r: DailyJob) => calcJobCollectable(r, pendingCtx, invoicedIds)
  const [history, setHistory]   = useState<DailyJob[][]>([])
  const [future, setFuture]     = useState<DailyJob[][]>([])

  // Active & Editing Cell State
  const [activeCell, setActiveCell] = useState<{ rowIdx: number; colId: string } | null>(null)
  const [editingCell, setEditingCell] = useState<{ rowIdx: number; colId: string; tempValue: string } | null>(null)
  const [formulaBarValue, setFormulaBarValue] = useState<string>('')
  const [filterSearch, setFilterSearch] = useState('')
  // What the grid was loaded from — Save All writes only the differences (AUD-49)
  const [loadedSnapshot, setLoadedSnapshot] = useState<Map<string, DailyJob>>(() => new Map())
  const [remoteConflict, setRemoteConflict] = useState(false)
  const [draftOffer, setDraftOffer] = useState<{ rows: DailyJob[]; savedAt: number } | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // ── UI View Options (Default: flat grid first as requested) ──
  const [viewMode, setViewMode] = useState<'blocks' | 'flat'>(() => {
    return safeGet('safaeewala_excel_view_mode', 'flat')
  })
  const [showFormulaBar, setShowFormulaBar] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [zoomLevel, setZoomLevel] = useState<number>(100)
  const [activeMenu, setActiveMenu] = useState<'file' | 'edit' | 'view' | 'formulas' | null>(null)

  // ── Custom Cleaner Colors State (Persisted in localStorage) ──
  const [cleanerColors, setCleanerColors] = useState<Record<string, string>>(() => {
    return safeGet('safaeewala_excel_cleaner_colors', {})
  })

  // ── Active Color Palette Tab ('solid' or 'light') ──
  const [colorPaletteTab, setColorPaletteTab] = useState<'solid' | 'light'>(() => {
    return safeGet('safaeewala_excel_color_tab', 'solid')
  })

  // ── Right-Click Context Menu State ──
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    rowIdx: number
    job: DailyJob
  } | null>(null)

  // Palette picker open for specific cleaner
  const [colorPickerCleaner, setColorPickerCleaner] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const formulaInputRef = useRef<HTMLInputElement>(null)
  const spreadsheetRef = useRef<HTMLDivElement>(null)

  // Jobs of the period shown in the grid
  const periodKey = `${dateFilterMode}|${selectedDate}|${rangeStart}|${rangeEnd}`
  const periodJobs = useMemo(() => {
    if (dateFilterMode === 'today') { const t = todayDubai(); return dailyJobs.filter(j => j.date === t) }
    if (dateFilterMode === 'yesterday') { const y = addDaysToYMD(todayDubai(), -1); return dailyJobs.filter(j => j.date === y) }
    if (dateFilterMode === 'range') return dailyJobs.filter(j => j.date >= rangeStart && j.date <= rangeEnd)
    if (dateFilterMode === 'all') return [...dailyJobs]
    return dailyJobs.filter(j => j.date === selectedDate)
  }, [dailyJobs, dateFilterMode, selectedDate, rangeStart, rangeEnd])

  /** Rows added, edited and removed in the grid compared with what was loaded (UX-33) */
  const pendingChanges = useMemo(() => {
    const gridIds = new Set(gridRows.map(r => r.id))
    const added = gridRows.filter(r => !loadedSnapshot.has(r.id) && !isBlankNewRow(r))
    const edited = gridRows.filter(r => { const o = loadedSnapshot.get(r.id); return o && !sameJobRow(o, r) })
    const removed = Array.from(loadedSnapshot.values()).filter(o => !gridIds.has(o.id))
    return { added, edited, removed, count: added.length + edited.length + removed.length }
  }, [gridRows, loadedSnapshot])
  const hasUnsavedChanges = pendingChanges.count > 0

  const latest = useRef({ gridRows, loadedSnapshot, hasUnsavedChanges, periodKey: '' })
  useEffect(() => {
    latest.current.gridRows = gridRows
    latest.current.loadedSnapshot = loadedSnapshot
    latest.current.hasUnsavedChanges = hasUnsavedChanges
  })
  const reloadAfterSaveRef = useRef(false)

  // Load the grid when the period changes. When jobs change elsewhere (another screen, device,
  // monthly auto-sync) while the grid has unsaved edits, merge rows the user did not touch and
  // keep the user's edits — never silently reload over them (AUD-48).
  useEffect(() => {
    const clone = (rows: DailyJob[]): DailyJob[] => JSON.parse(JSON.stringify(rows))
    const { gridRows: grid, loadedSnapshot: snap, hasUnsavedChanges: dirty, periodKey: shownKey } = latest.current
    const periodChanged = shownKey !== periodKey
    if (periodChanged || !dirty || reloadAfterSaveRef.current) {
      reloadAfterSaveRef.current = false
      latest.current.periodKey = periodKey
      const rows = clone(periodJobs)
      setGridRows(rows)
      setLoadedSnapshot(new Map(rows.map(r => [r.id, r])))
      setHistory([])
      setFuture([])
      setRemoteConflict(false)
      if (periodChanged) {
        const draft = safeGet<{ rows: DailyJob[]; savedAt: number } | null>(DRAFT_PREFIX + periodKey, null)
        setDraftOffer(draft && Array.isArray(draft.rows) ? draft : null)
      }
      return
    }
    const remote = new Map(periodJobs.map(j => [j.id, j]))
    const nextSnap = new Map(snap)
    let nextGrid = [...grid]
    let conflict = false
    remote.forEach((job, id) => {
      const was = snap.get(id)
      if (!was) {
        nextSnap.set(id, clone([job])[0])
        if (!nextGrid.some(r => r.id === id)) nextGrid.push(clone([job])[0])
        return
      }
      if (sameJobRow(was, job)) return
      const mine = nextGrid.find(r => r.id === id)
      if (mine && !sameJobRow(was, mine)) { conflict = true; return }
      nextSnap.set(id, clone([job])[0])
      if (mine) nextGrid = nextGrid.map(r => (r.id === id ? clone([job])[0] : r))
    })
    snap.forEach((was, id) => {
      if (remote.has(id)) return
      const mine = nextGrid.find(r => r.id === id)
      if (mine && !sameJobRow(was, mine)) { conflict = true; return }
      nextSnap.delete(id)
      nextGrid = nextGrid.filter(r => r.id !== id)
    })
    setGridRows(nextGrid)
    setLoadedSnapshot(nextSnap)
    if (conflict) setRemoteConflict(true)
  }, [periodKey, periodJobs])

  // Keep a local draft of unsaved edits so a refresh or leaving the page never loses them (UX-34)
  useEffect(() => {
    const key = DRAFT_PREFIX + periodKey
    try {
      if (hasUnsavedChanges) localStorage.setItem(key, JSON.stringify({ rows: gridRows, savedAt: Date.now() }))
      else if (!draftOffer) localStorage.removeItem(key)
    } catch { /* storage full — the leave warning still protects the edits */ }
  }, [gridRows, hasUnsavedChanges, periodKey, draftOffer])

  // Warn before closing / refreshing the tab with unsaved edits (UX-34)
  useEffect(() => {
    if (!hasUnsavedChanges) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [hasUnsavedChanges])

  // Update formula bar when active cell changes
  useEffect(() => {
    if (activeCell) {
      const row = gridRows[activeCell.rowIdx]
      if (row) {
        const val = row[activeCell.colId as keyof DailyJob]
        setFormulaBarValue(val !== undefined && val !== null ? String(val) : '')
      }
    } else {
      setFormulaBarValue('')
    }
  }, [activeCell, gridRows])

  // Auto-focus input when cell editing starts
  const editingKey = editingCell ? `${editingCell.rowIdx}:${editingCell.colId}` : ''
  useEffect(() => {
    if (!editingKey) return
    setTimeout(() => {
      const el = inputRef.current
      el?.focus()
      try { if (el && el.type === 'text') el.setSelectionRange(el.value.length, el.value.length) } catch { /* not a text input */ }
    }, 25)
  }, [editingKey])

  // Global Click Listener to close Context Menu and Menu Dropdowns
  useEffect(() => {
    const handleGlobalClick = () => {
      setContextMenu(null)
      setActiveMenu(null)
      setColorPickerCleaner(null)
    }
    window.addEventListener('click', handleGlobalClick)
    return () => window.removeEventListener('click', handleGlobalClick)
  }, [])


  // ── Push State to Undo Stack ──
  const pushState = (newRows: DailyJob[]) => {
    setHistory(prev => [...prev.slice(-40), JSON.parse(JSON.stringify(gridRows))])
    setFuture([])
    setGridRows(newRows)
  }

  // ── Undo & Redo ──
  const handleUndo = () => {
    if (history.length === 0) {
      showToast('Nothing to undo')
      return
    }
    const previous = history[history.length - 1]
    setFuture(prev => [JSON.parse(JSON.stringify(gridRows)), ...prev])
    setHistory(prev => prev.slice(0, prev.length - 1))
    setGridRows(previous)
    showToast('Undo executed (Ctrl+Z)')
  }

  const handleRedo = () => {
    if (future.length === 0) {
      showToast('Nothing to redo')
      return
    }
    const next = future[0]
    setHistory(prev => [...prev, JSON.parse(JSON.stringify(gridRows))])
    setFuture(prev => prev.slice(1))
    setGridRows(next)
    showToast('Redo executed (Ctrl+Y)')
  }

  // Active cell coordinate display (e.g. "B4")
  const activeCellCoord = useMemo(() => {
    if (!activeCell) return 'A1'
    const colDef = COLUMNS.find(c => c.id === activeCell.colId)
    const letter = colDef?.col || 'A'
    return `${letter}${activeCell.rowIdx + 1}`
  }, [activeCell])

  // Show Toast
  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3000)
  }

  // Date Navigation
  const prevDay = () => {
    const next = addDaysToYMD(selectedDate, -1)
    setSelectedDate(next)
    setSearchParams({ date: next }, { replace: true })
  }
  const nextDay = () => {
    const next = addDaysToYMD(selectedDate, 1)
    setSelectedDate(next)
    setSearchParams({ date: next }, { replace: true })
  }

  // Toggle Fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {})
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {})
    }
  }

  // Cell Click Handler
  const handleCellClick = (rowIdx: number, colId: string) => {
    if (editingCell && (editingCell.rowIdx !== rowIdx || editingCell.colId !== colId)) {
      commitCellEdit()
    }
    setActiveCell({ rowIdx, colId })
  }

  // Cell Double-click Handler
  const handleCellDoubleClick = (rowIdx: number, colId: string) => {
    if (READ_ONLY_COLS.has(colId)) { setActiveCell({ rowIdx, colId }); return }
    const row = gridRows[rowIdx]
    const curVal = row?.[colId as keyof DailyJob]
    setActiveCell({ rowIdx, colId })
    setEditingCell({
      rowIdx,
      colId,
      tempValue: curVal !== undefined && curVal !== null ? String(curVal) : ''
    })
  }

  /** Index (in gridRows) of each visible row, in screen order */
  const visibleOrder = () => visibleGridRows.map(r => gridRows.findIndex(g => g.id === r.id)).filter(i => i >= 0)

  /** Move the active cell by rows / columns in screen order (UX-36) */
  const moveActive = (dRow: number, dCol: number, from = activeCell) => {
    const order = visibleOrder()
    if (order.length === 0) return
    if (!from) { setActiveCell({ rowIdx: order[0], colId: columns[0]?.id as string }); return }
    const colIds = columns.map(c => c.id as string)
    let pos = Math.max(0, order.indexOf(from.rowIdx))
    let ci = Math.max(0, colIds.indexOf(from.colId)) + dCol
    if (ci >= colIds.length) { ci = 0; pos += 1 } else if (ci < 0) { ci = colIds.length - 1; pos -= 1 }
    pos = Math.min(order.length - 1, Math.max(0, pos + dRow))
    setActiveCell({ rowIdx: order[pos], colId: colIds[ci] })
  }

  /** Put a typed / pasted value into a row, with the same parsing as cell editing */
  const applyCellValue = (row: DailyJob, colId: string, raw: string): DailyJob => {
    if (READ_ONLY_COLS.has(colId)) return row
    const v = raw.trim()
    const next = { ...row } as DailyJob & Record<string, unknown>
    if (colId === 'charges' || colId === 'received' || colId === 'duty_hours' || colId === 'ot_hours') next[colId] = cleanNum(v)
    else if (colId === 'start_time' || colId === 'end_time') {
      const fmt = formatTimeOnly(v)
      next[colId] = fmt !== '—' ? fmt : v
      if (next.start_time && next.end_time && next.start_time !== '—' && next.end_time !== '—') {
        next.duty_hours = Math.round(calcHours(next.start_time, next.end_time) * 10) / 10
        next.ot_hours = Math.round(calcOTHours(next.start_time, next.end_time) * 10) / 10
      }
    } else next[colId] = v
    return next
  }

  const blankRow = (base?: Partial<DailyJob>): DailyJob => ({
    id: newRowId('new'),
    date: base?.date || effectiveTargetDate,
    staff_name: base?.staff_name || '',
    start_time: '', end_time: '', duty_hours: 0, ot_hours: 0, address: '', area: '',
    charges: 0, received: 0, payment_mode: 'Cash', is_overtime: false, material: 'No', service: '', remarks: '',
    created_at: new Date().toISOString(),
  })

  /** Paste a block copied from Excel / Google Sheets at the active cell; adds rows as needed (UX-32) */
  const pasteBlock = (text: string) => {
    if (!activeCell) { showToast('Click a cell first, then paste'); return }
    const lines = text.replace(/\r/g, '').split('\n')
    while (lines.length && lines[lines.length - 1] === '') lines.pop()
    if (lines.length === 0) return
    const order = visibleOrder()
    const colIds = columns.map(c => c.id as string)
    const startPos = Math.max(0, order.indexOf(activeCell.rowIdx))
    const startCol = Math.max(0, colIds.indexOf(activeCell.colId))
    const updated = [...gridRows]
    let added = 0
    lines.forEach((line, i) => {
      let idx = order[startPos + i]
      if (idx === undefined) {
        updated.push(blankRow(updated[order[order.length - 1]]))
        idx = updated.length - 1
        added++
      }
      let row = updated[idx]
      line.split('\t').forEach((cell, j) => {
        const colId = colIds[startCol + j]
        if (colId) row = applyCellValue(row, colId, cell)
      })
      updated[idx] = row
    })
    pushState(updated)
    showToast(`✓ Pasted ${lines.length} row${lines.length === 1 ? '' : 's'}${added ? ` (${added} new)` : ''}`)
  }

  /** Ctrl+D — copy the value from the row above into the active cell (UX-32) */
  const fillDown = () => {
    if (!activeCell || READ_ONLY_COLS.has(activeCell.colId)) return
    const order = visibleOrder()
    const pos = order.indexOf(activeCell.rowIdx)
    if (pos <= 0) return
    const above = gridRows[order[pos - 1]]
    const val = above?.[activeCell.colId as keyof DailyJob]
    const updated = [...gridRows]
    updated[activeCell.rowIdx] = applyCellValue(updated[activeCell.rowIdx], activeCell.colId, val == null ? '' : String(val))
    pushState(updated)
  }

  /** Delete / Backspace — clear the active cell */
  const clearActiveCell = () => {
    if (!activeCell || READ_ONLY_COLS.has(activeCell.colId)) return
    const updated = [...gridRows]
    const row = updated[activeCell.rowIdx]
    if (!row) return
    updated[activeCell.rowIdx] = applyCellValue(row, activeCell.colId, '')
    pushState(updated)
  }

  /** Keys inside the cell editor: Enter / Tab save and move, Esc cancels (UX-36) */
  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      const from = editingCell ? { rowIdx: editingCell.rowIdx, colId: editingCell.colId } : activeCell
      commitCellEdit()
      if (e.key === 'Enter') moveActive(e.shiftKey ? -1 : 1, 0, from)
      else moveActive(0, e.shiftKey ? -1 : 1, from)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setEditingCell(null)
    }
  }

  // Commit Cell Edit
  const commitCellEdit = (): DailyJob[] => {
    if (!editingCell) return gridRows
    const { rowIdx, colId, tempValue } = editingCell
    const trimmed = tempValue.trim()

    const updated = [...gridRows]
    const row = { ...updated[rowIdx] }

    if (colId === 'charges' || colId === 'received' || colId === 'duty_hours' || colId === 'ot_hours') {
      if (trimmed.startsWith('=')) {
        const evaluated = evaluateFormula(trimmed, updated, rowIdx)
        ;(row as any)[colId] = typeof evaluated === 'number' ? evaluated : cleanNum(evaluated)
      } else {
        ;(row as any)[colId] = cleanNum(trimmed)
      }
    } else if (colId === 'start_time' || colId === 'end_time') {
      const fmt = formatTimeOnly(trimmed)
      ;(row as any)[colId] = fmt !== '—' ? fmt : trimmed
      if (row.start_time && row.end_time && row.start_time !== '—' && row.end_time !== '—') {
        row.duty_hours = Math.round(calcHours(row.start_time, row.end_time) * 10) / 10
        row.ot_hours = Math.round(calcOTHours(row.start_time, row.end_time) * 10) / 10
      }
    } else {
      ;(row as any)[colId] = trimmed
    }

    updated[rowIdx] = row
    pushState(updated)
    setEditingCell(null)
    return updated
  }

  // Formula Bar change
  const handleFormulaBarChange = (newVal: string) => {
    setFormulaBarValue(newVal)
    if (activeCell) {
      const updated = [...gridRows]
      const row = { ...updated[activeCell.rowIdx] }
      const { colId } = activeCell

      if (newVal.startsWith('=')) {
        const evaluated = evaluateFormula(newVal, updated, activeCell.rowIdx)
        ;(row as any)[colId] = typeof evaluated === 'number' ? evaluated : evaluated
      } else if (colId === 'charges' || colId === 'received' || colId === 'duty_hours' || colId === 'ot_hours') {
        ;(row as any)[colId] = cleanNum(newVal)
      } else {
        ;(row as any)[colId] = newVal
      }

      updated[activeCell.rowIdx] = row
      pushState(updated)
    }
  }

  // ── Insert Row Above or Below (Used by Right-Click Menu) ──
  const insertRowAt = (targetIdx: number, position: 'above' | 'below', defaultStaff?: string) => {
    const newJob: DailyJob = {
      id: newRowId('new'),
      date: effectiveTargetDate,
      staff_name: defaultStaff || '',
      start_time: '08:00',
      end_time: '16:00',
      duty_hours: 8,
      ot_hours: 0,
      address: '',
      area: '',
      charges: 0,
      received: 0,
      payment_mode: 'Cash',
      is_overtime: false,
      material: 'No',
      service: '',
      remarks: '',
      created_at: new Date().toISOString()
    }

    const insertIdx = position === 'above' ? targetIdx : targetIdx + 1
    const updated = [...gridRows]
    updated.splice(insertIdx, 0, newJob)
    pushState(updated)
    setActiveCell({ rowIdx: insertIdx, colId: 'address' })
    setContextMenu(null)
    showToast(`✓ Row added ${position === 'above' ? 'at top (above)' : 'at bottom (below)'}`)
  }

  // Add New Row at bottom of sheet
  const handleAddRow = () => {
    insertRowAt(gridRows.length - 1, 'below')
  }

  // Duplicate Selected Row
  const handleDuplicateRow = (idx: number) => {
    const target = gridRows[idx]
    if (!target) return
    const duplicated: DailyJob = {
      ...target,
      id: newRowId('copy'),
      created_at: new Date().toISOString()
    }
    const updated = [...gridRows]
    updated.splice(idx + 1, 0, duplicated)
    pushState(updated)
    setActiveCell({ rowIdx: idx + 1, colId: 'address' })
    setContextMenu(null)
    showToast(`Row #${idx + 1} duplicated`)
  }

  // Delete Selected Row
  const handleDeleteRow = (idx: number) => {
    const target = gridRows[idx]
    if (!target) return
    const updated = gridRows.filter((_, i) => i !== idx)
    pushState(updated)
    if (activeCell?.rowIdx === idx) setActiveCell(null)
    setContextMenu(null)
    showToast(`Row #${idx + 1} deleted`)
  }

  // Clear Row Contents
  const handleClearRow = (idx: number) => {
    const target = gridRows[idx]
    if (!target) return
    const updated = [...gridRows]
    updated[idx] = {
      ...target,
      start_time: '—',
      end_time: '—',
      duty_hours: 0,
      ot_hours: 0,
      address: '',
      area: '',
      charges: 0,
      received: 0,
      remarks: ''
    }
    pushState(updated)
    setContextMenu(null)
    showToast(`Row #${idx + 1} cleared`)
  }

  // ── Change Cleaner Block Color (Persisted & Forces Immediate Grid Re-render) ──
  const setCleanerColor = (cleanerName: string, paletteKey: string) => {
    const cleanStaff = (cleanerName || 'Unassigned Staff').trim()
    const key = cleanStaff.toLowerCase()
    const updated = { ...cleanerColors, [key]: paletteKey }
    setCleanerColors(updated)
    safeSet('safaeewala_excel_cleaner_colors', updated)
    setColorPickerCleaner(null)
    setContextMenu(null)

    // Force grid rows to re-render immediately with the updated solid block color
    setGridRows(prev => [...prev])
    showToast(`✓ Block color for "${cleanStaff}" set to ${BLOCK_PALETTES[paletteKey]?.name || paletteKey}`)
  }

  // Get palette for a cleaner
  const getCleanerPalette = (cleanerName: string, idx: number): BlockPalette => {
    const key = (cleanerName || '').trim().toLowerCase()
    const customKey = cleanerColors[key]
    if (customKey && BLOCK_PALETTES[customKey]) {
      return BLOCK_PALETTES[customKey]
    }
    // Default deterministic assignment
    const paletteKey = PALETTE_KEYS[idx % PALETTE_KEYS.length]
    return BLOCK_PALETTES[paletteKey]
  }

  // Right-Click Context Menu Trigger
  const handleContextMenu = (e: React.MouseEvent, rowIdx: number, job: DailyJob) => {
    e.preventDefault()
    e.stopPropagation()
    const clickX = e.clientX
    const clickY = e.clientY
    // Keep context menu on screen with taller height for 20 solid colors options panel
    const menuWidth = 330
    const menuHeight = 540
    const posX = clickX + menuWidth > window.innerWidth ? Math.max(10, window.innerWidth - menuWidth - 15) : clickX
    const posY = clickY + menuHeight > window.innerHeight ? Math.max(10, window.innerHeight - menuHeight - 15) : clickY

    setActiveCell({ rowIdx, colId: 'staff_name' })
    setContextMenu({
      x: posX,
      y: posY,
      rowIdx,
      job
    })
  }

  // Backup to Google Drive (via n8n Webhook or direct Google Drive)
  const handleBackupToDrive = async () => {
    const webhookUrl = getDriveWebhookUrl()
    if (!webhookUrl && !gdriveConfigured) {
      setShowDriveModal(true)
      return
    }

    try {
      setIsBackingUp(true)
      setDriveStatus('uploading')
      setDriveError('')

      const exportData = gridRows.map((r, i) => {
        const rowObj: Record<string, any> = { 'Row': i + 1 }
        columns.forEach(col => {
          let val: any = r[col.id as keyof DailyJob]
          if (col.id === 'pending') val = rowPending(r)
          rowObj[col.label] = val !== undefined && val !== null ? val : ''
        })
        return rowObj
      })

      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.json_to_sheet(exportData)
      XLSX.utils.book_append_sheet(wb, ws, `DailyJobSheet`)
      const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const filename = `DailyJobSheet_${selectedDate}.xlsx`

      if (webhookUrl) {
        const summary = {
          date: selectedDate,
          total_charges: totals.totalCharges,
          total_received: totals.totalReceived,
          total_pending: totals.totalPending,
          total_duty: totals.totalDuty,
          total_ot: totals.totalOT,
          jobs_count: gridRows.length,
          cleaners_count: cleanerGroups.length
        }

        const result = await sendDailySheetBackupViaWebhook({
          date: selectedDate,
          filename,
          blob,
          summary,
          jobs: gridRows,
          expenses: [],
          webhookUrl
        })

        if (result.driveUrl) setDriveLink(result.driveUrl)
        setDriveStatus('done')
        showToast('✓ Sheet backed up successfully to Google Drive!')
        return
      }

      if (gdriveConfigured) {
        let token = getAccessToken()
        if (!token) token = await authorizeGoogleDrive()
        const link = await uploadToDrive(blob, filename, token)
        setDriveLink(link)
        setDriveStatus('done')
        showToast('✓ Sheet uploaded successfully to Google Drive!')
        return
      }
    } catch (err: any) {
      setDriveError(err.message || 'Backup failed')
      setDriveStatus('error')
      showToast(`Backup error: ${err.message || 'Failed'}`)
    } finally {
      setIsBackingUp(false)
    }
  }

  // Save All — writes only rows added, edited or removed in this grid (AUD-49, UX-33).
  // Rows outside the grid are never touched; rows changed elsewhere since loading ask first.
  const handleSaveAll = async () => {
    const rows = commitCellEdit()
    const gridIds = new Set(rows.map(r => r.id))
    const added = rows.filter(r => !loadedSnapshot.has(r.id) && !isBlankNewRow(r))
    const edited = rows.filter(r => { const o = loadedSnapshot.get(r.id); return o && !sameJobRow(o, r) })
    const removed = Array.from(loadedSnapshot.values()).filter(o => !gridIds.has(o.id))
    if (added.length + edited.length + removed.length === 0) { showToast('Nothing to save'); return }

    const live = new Map(dailyJobs.map(j => [j.id, j]))
    const changedElsewhere = [...edited, ...removed].filter(r => {
      const now = live.get(r.id)
      const was = loadedSnapshot.get(r.id)
      return !now || (was && !sameJobRow(was, now))
    })
    if (changedElsewhere.length > 0) {
      const ok = await confirmAsync({
        title: 'Changed on another screen',
        message: `${changedElsewhere.length} row(s) were changed or deleted somewhere else after you opened this sheet. Save your version over them?`,
        confirmLabel: 'Save my version',
        cancelLabel: 'Cancel',
      })
      if (!ok) return
    }

    const payload = (row: DailyJob) => ({
      date: row.date || selectedDate,
      staff_name: row.staff_name,
      start_time: row.start_time,
      end_time: row.end_time,
      duty_hours: cleanNum(row.duty_hours),
      ot_hours: cleanNum(row.ot_hours),
      address: row.address,
      area: row.area,
      charges: cleanNum(row.charges),
      received: cleanNum(row.received),
      payment_mode: row.payment_mode,
      is_overtime: cleanNum(row.ot_hours) > 0,
      material: row.material,
      service: row.service,
      remarks: row.remarks,
    })

    reloadAfterSaveRef.current = true
    removed.forEach(r => { if (live.has(r.id)) deleteDailyJob(r.id) })
    edited.forEach(r => {
      if (live.has(r.id)) updateDailyJob(r.id, payload(r))
      else addDailyJob(payload(r)) // deleted elsewhere — the user chose to keep their version
    })
    added.forEach(r => addDailyJob(payload(r)))

    try { localStorage.removeItem(DRAFT_PREFIX + periodKey) } catch { /* ignore */ }
    setDraftOffer(null)
    setRemoteConflict(false)
    const parts = [added.length && `${added.length} added`, edited.length && `${edited.length} updated`, removed.length && `${removed.length} deleted`].filter(Boolean)
    showToast(`✓ Saved: ${parts.join(', ')}`)
  }

  // Keyboard: Undo/Redo/Save/Esc + Excel keys (arrows, Tab, Enter/F2, Delete, Ctrl+D, type to edit) — UX-36.
  // The listener reads the latest handler through a ref, so Save never works on stale data.
  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {})
  const clipboardRef = useRef<{ copy: (e: ClipboardEvent) => void; paste: (e: ClipboardEvent) => void }>({ copy: () => {}, paste: () => {} })
  useEffect(() => {
    const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
    keyHandlerRef.current = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo(); return }
      if (mod && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); handleRedo(); return }
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); void handleSaveAll(); return }
      if (e.key === 'Escape') {
        setContextMenu(null)
        setActiveMenu(null)
        setColorPickerCleaner(null)
        if (editingCell) setEditingCell(null)
        return
      }
      // Grid keys only when a cell is selected and nothing else has focus
      if (editingCell || !activeCell || isTyping(e.target)) return
      if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); fillDown(); return }
      if (mod || e.altKey) return
      const moves: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }
      if (moves[e.key]) { e.preventDefault(); moveActive(...moves[e.key]); return }
      if (e.key === 'Tab') { e.preventDefault(); moveActive(0, e.shiftKey ? -1 : 1); return }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); clearActiveCell(); return }
      if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); handleCellDoubleClick(activeCell.rowIdx, activeCell.colId); return }
      // Typing a character starts editing with that character, like Excel
      if (e.key.length === 1 && !READ_ONLY_COLS.has(activeCell.colId)) {
        const col = columns.find(c => c.id === activeCell.colId)
        if (!col || col.type === 'select' || col.type === 'date') return
        e.preventDefault()
        setEditingCell({ rowIdx: activeCell.rowIdx, colId: activeCell.colId, tempValue: e.key })
      }
    }
    clipboardRef.current = {
      copy: (e: ClipboardEvent) => {
        if (editingCell || !activeCell || isTyping(e.target)) return
        const v = activeCell.colId === 'pending'
          ? rowPending(gridRows[activeCell.rowIdx])
          : gridRows[activeCell.rowIdx]?.[activeCell.colId as keyof DailyJob]
        e.clipboardData?.setData('text/plain', v == null ? '' : String(v))
        e.preventDefault()
      },
      paste: (e: ClipboardEvent) => {
        if (editingCell || !activeCell || isTyping(e.target)) return
        const text = e.clipboardData?.getData('text/plain') || ''
        if (!text) return
        e.preventDefault()
        pasteBlock(text)
      },
    }
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyHandlerRef.current(e)
    const onCopy = (e: ClipboardEvent) => clipboardRef.current.copy(e)
    const onPaste = (e: ClipboardEvent) => clipboardRef.current.paste(e)
    window.addEventListener('keydown', onKey)
    document.addEventListener('copy', onCopy)
    document.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('copy', onCopy)
      document.removeEventListener('paste', onPaste)
    }
  }, [])

  /** Throw away the grid's edits and load the latest saved jobs */
  const reloadFromSaved = async () => {
    if (hasUnsavedChanges) {
      const ok = await confirmAsync({ title: 'Discard edits?', message: `Discard your ${pendingChanges.count} unsaved change(s) and load the latest saved data?`, confirmLabel: 'Discard & reload', tone: 'danger' })
      if (!ok) return
    }
    const rows: DailyJob[] = JSON.parse(JSON.stringify(periodJobs))
    setGridRows(rows)
    setLoadedSnapshot(new Map(rows.map(r => [r.id, r])))
    setHistory([])
    setFuture([])
    setRemoteConflict(false)
    setDraftOffer(null)
    try { localStorage.removeItem(DRAFT_PREFIX + periodKey) } catch { /* ignore */ }
  }

  // Export Spreadsheet to Excel (.xlsx) with dynamic column order
  const handleExportXLSX = () => {
    const exportData = gridRows.map((r, i) => {
      const rowObj: Record<string, any> = { 'Row': i + 1 }
      columns.forEach(col => {
        let val: any = r[col.id as keyof DailyJob]
        if (col.id === 'pending') val = rowPending(r)
        rowObj[col.label] = val !== undefined && val !== null ? val : ''
      })
      return rowObj
    })

    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, `JobSheet_${selectedDate}`)
    XLSX.writeFile(wb, `DailyJobSheet_Excel_${selectedDate}.xlsx`)
    showToast('Spreadsheet downloaded as .xlsx')
  }

  // Export CSV with dynamic column order
  const handleExportCSV = () => {
    const exportData = gridRows.map((r, i) => {
      const rowObj: Record<string, any> = { 'Row': i + 1 }
      columns.forEach(col => {
        let val: any = r[col.id as keyof DailyJob]
        if (col.id === 'pending') val = rowPending(r)
        rowObj[col.label] = val !== undefined && val !== null ? val : ''
      })
      return rowObj
    })
    const ws = XLSX.utils.json_to_sheet(exportData)
    const csv = XLSX.utils.sheet_to_csv(ws)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `DailyJobSheet_${selectedDate}.csv`
    link.click()
    showToast('Spreadsheet downloaded as .csv')
  }

  // Filtered rows for search
  const [renderLimit, setRenderLimit] = useState(RENDER_PAGE)
  const filteredGridRows = useMemo(() => {
    if (!filterSearch.trim()) return gridRows
    const q = filterSearch.toLowerCase()
    return gridRows.filter(r =>
      (r.staff_name || '').toLowerCase().includes(q) ||
      (r.address || '').toLowerCase().includes(q) ||
      (r.area || '').toLowerCase().includes(q) ||
      (r.payment_mode || '').toLowerCase().includes(q) ||
      (r.service || '').toLowerCase().includes(q)
    )
  }, [gridRows, filterSearch])
  const visibleGridRows = useMemo(() => filteredGridRows.slice(0, renderLimit), [filteredGridRows, renderLimit])

  // Summary Totals
  const totals = useMemo(() => {
    const totalCharges = gridRows.reduce((s, r) => s + cleanNum(r.charges), 0)
    const totalReceived = gridRows.reduce((s, r) => s + cleanNum(r.received), 0)
    // Per-row dues: an overpaid row must not hide another row's due
    const totalPending = gridRows.reduce((s, r) => s + rowPending(r), 0)
    const totalDuty = Math.round(gridRows.reduce((s, r) => s + cleanNum(r.duty_hours), 0) * 10) / 10
    const totalOT = Math.round(gridRows.reduce((s, r) => s + cleanNum(r.ot_hours), 0) * 10) / 10
    return { totalCharges, totalReceived, totalPending, totalDuty, totalOT }
  }, [gridRows, pendingCtx])

  // ── Group Rows by Cleaner for Block Mode ──
  const cleanerGroups = useMemo(() => {
    const groups: {
      cleanerName: string
      palette: BlockPalette
      jobs: { row: DailyJob; globalIndex: number }[]
      totalDuty: number
      totalOT: number
      totalCharges: number
      totalReceived: number
      totalPending: number
    }[] = []

    const map = new Map<string, typeof groups[0]>()
    let staffIdx = 0

    visibleGridRows.forEach((row) => {
      // Find global index in gridRows for exact row updates
      const globalIndex = gridRows.findIndex(r => r.id === row.id)
      const rawName = (row.staff_name || 'Unassigned Staff').trim()
      const key = rawName.toLowerCase()

      if (!map.has(key)) {
        const palette = getCleanerPalette(rawName, staffIdx++)
        const newGroup = {
          cleanerName: rawName,
          palette,
          jobs: [],
          totalDuty: 0,
          totalOT: 0,
          totalCharges: 0,
          totalReceived: 0,
          totalPending: 0
        }
        map.set(key, newGroup)
        groups.push(newGroup)
      }

      const g = map.get(key)!
      g.jobs.push({ row, globalIndex: globalIndex >= 0 ? globalIndex : 0 })
      g.totalDuty += cleanNum(row.duty_hours)
      g.totalOT += cleanNum(row.ot_hours)
      g.totalCharges += cleanNum(row.charges)
      g.totalReceived += cleanNum(row.received)
      g.totalPending += rowPending(row)
    })

    groups.forEach(g => {
      g.totalDuty = Math.round(g.totalDuty * 10) / 10
      g.totalOT = Math.round(g.totalOT * 10) / 10
    })

    return groups
  }, [visibleGridRows, gridRows, cleanerColors, pendingCtx])

  // Cleaner index lookup for consistent color tints in Flat Grid Mode
  const cleanerIndexMap = useMemo(() => {
    const map = new Map<string, number>()
    let idx = 0
    visibleGridRows.forEach(row => {
      const name = (row.staff_name || 'Unassigned Staff').trim().toLowerCase()
      if (!map.has(name)) {
        map.set(name, idx++)
      }
    })
    return map
  }, [visibleGridRows])

  // Auto Recalculate all duty & OT hours
  const handleRecalculateHours = () => {
    const updated = gridRows.map(r => {
      if (r.start_time && r.end_time && r.start_time !== '—' && r.end_time !== '—') {
        const duty = Math.round(calcHours(r.start_time, r.end_time) * 10) / 10
        const ot = Math.round(calcOTHours(r.start_time, r.end_time) * 10) / 10
        return { ...r, duty_hours: duty, ot_hours: ot }
      }
      return r
    })
    pushState(updated)
    showToast('✓ All Duty & Overtime hours recalculated from Start/End times')
  }

  return (
    <div
      ref={spreadsheetRef}
      style={{ zoom: `${zoomLevel}%` }}
      className="flex flex-col h-screen w-screen bg-[#f3f4f6] text-slate-900 overflow-hidden select-none font-sans fixed inset-0 z-50"
    >
      {/* ── Toast Notification ── */}
      {toastMessage && (
        <div className="fixed top-16 right-8 z-[120] bg-emerald-900 text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 border border-emerald-500 animate-in fade-in slide-in-from-top-3">
          <Check size={16} className="text-emerald-300" />
          <span className="text-[13px] font-bold">{toastMessage}</span>
        </div>
      )}

      {/* ── Excel Green Title Ribbon Header (Spacious Height & Clean Layout) ── */}
      <header className="bg-[#107c41] text-white px-5 py-3.5 min-h-[58px] flex items-center justify-between shadow-md shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (window.opener) {
                try {
                  window.close()
                  return
                } catch {}
              }
              navigate(`/daily-job-sheet?date=${selectedDate}`)
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-[12px] transition-colors cursor-pointer border border-white/20 shadow-xs"
            title="Back to Daily Job Sheet (or close tab)"
          >
            <ArrowLeft size={14} />
            <span>Back</span>
          </button>

          <div className="h-5 w-px bg-white/20" />

          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-white text-[#107c41] flex items-center justify-center font-black text-sm shadow-xs">
              <FileSpreadsheet size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-[15.5px] tracking-tight">Excel Job Sheet Studio</span>
                {hasUnsavedChanges && (
                  <span className="text-[9.5px] font-black px-2 py-0.5 rounded-full bg-amber-400 text-amber-950 animate-pulse">
                    ● {pendingChanges.count} unsaved change{pendingChanges.count === 1 ? '' : 's'}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic Date Filters & Action Controls */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Quick Undo & Redo buttons */}
          <div className="flex items-center bg-black/20 rounded-xl p-0.5 border border-white/20">
            <button
              onClick={handleUndo}
              disabled={history.length === 0}
              className={`p-1.5 rounded-lg transition-colors ${history.length > 0 ? 'text-white hover:bg-white/20 cursor-pointer' : 'text-white/40 cursor-not-allowed'}`}
              title="Undo (Ctrl+Z)"
            >
              <Undo2 size={14} />
            </button>
            <button
              onClick={handleRedo}
              disabled={future.length === 0}
              className={`p-1.5 rounded-lg transition-colors ${future.length > 0 ? 'text-white hover:bg-white/20 cursor-pointer' : 'text-white/40 cursor-not-allowed'}`}
              title="Redo (Ctrl+Y)"
            >
              <Redo2 size={14} />
            </button>
          </div>

          {/* ── Dynamic Date Filters Pill Bar ── */}
          <div className="flex items-center gap-1 bg-black/25 rounded-xl p-1 border border-white/20 text-white text-[11px]">
            <div className="flex items-center gap-0.5 bg-black/20 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => {
                  const today = todayDubai()
                  setDateFilterMode('today')
                  setSelectedDate(today)
                  setSearchParams({ date: today }, { replace: true })
                }}
                className={`px-2 py-1 rounded-md font-bold transition-all cursor-pointer ${
                  dateFilterMode === 'today' ? 'bg-white text-emerald-900 shadow-xs' : 'text-white/80 hover:text-white hover:bg-white/10'
                }`}
                title="View Today's Jobs"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => {
                  const yest = addDaysToYMD(todayDubai(), -1)
                  setDateFilterMode('yesterday')
                  setSelectedDate(yest)
                  setSearchParams({ date: yest }, { replace: true })
                }}
                className={`px-2 py-1 rounded-md font-bold transition-all cursor-pointer ${
                  dateFilterMode === 'yesterday' ? 'bg-white text-emerald-900 shadow-xs' : 'text-white/80 hover:text-white hover:bg-white/10'
                }`}
                title="View Yesterday's Jobs"
              >
                Yesterday
              </button>
              <button
                type="button"
                onClick={() => setDateFilterMode('single')}
                className={`px-2 py-1 rounded-md font-bold transition-all cursor-pointer ${
                  dateFilterMode === 'single' ? 'bg-white text-emerald-900 shadow-xs' : 'text-white/80 hover:text-white hover:bg-white/10'
                }`}
                title="Single Date Picker"
              >
                Date
              </button>
              <button
                type="button"
                onClick={() => setDateFilterMode('range')}
                className={`px-2 py-1 rounded-md font-bold transition-all cursor-pointer ${
                  dateFilterMode === 'range' ? 'bg-white text-emerald-900 shadow-xs' : 'text-white/80 hover:text-white hover:bg-white/10'
                }`}
                title="Date Range Filter"
              >
                Range
              </button>
              <button
                type="button"
                onClick={() => setDateFilterMode('all')}
                className={`px-2 py-1 rounded-md font-bold transition-all cursor-pointer ${
                  dateFilterMode === 'all' ? 'bg-white text-emerald-900 shadow-xs' : 'text-white/80 hover:text-white hover:bg-white/10'
                }`}
                title="View All Dates"
              >
                All
              </button>
            </div>

            {/* Date Picker (Single Day Mode) */}
            {dateFilterMode === 'single' && (
              <div className="flex items-center">
                <button
                  onClick={prevDay}
                  className="p-1 hover:bg-white/20 rounded-md transition-colors cursor-pointer"
                  title="Previous Day"
                >
                  <ChevronLeft size={15} />
                </button>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={e => {
                    setSelectedDate(e.target.value)
                    setSearchParams({ date: e.target.value }, { replace: true })
                  }}
                  className="bg-transparent px-1.5 py-0.5 font-bold text-center focus:outline-none cursor-pointer [color-scheme:dark] text-[11.5px]"
                />
                <button
                  onClick={nextDay}
                  className="p-1 hover:bg-white/20 rounded-md transition-colors cursor-pointer"
                  title="Next Day"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            )}

            {/* Date Range Inputs */}
            {dateFilterMode === 'range' && (
              <div className="flex items-center gap-1 px-1">
                <input
                  type="date"
                  value={rangeStart}
                  onChange={e => setRangeStart(e.target.value)}
                  className="bg-transparent px-1 py-0.5 font-bold focus:outline-none cursor-pointer [color-scheme:dark] text-[11px]"
                  title="From Date"
                />
                <span className="text-white/60">to</span>
                <input
                  type="date"
                  value={rangeEnd}
                  onChange={e => setRangeEnd(e.target.value)}
                  className="bg-transparent px-1 py-0.5 font-bold focus:outline-none cursor-pointer [color-scheme:dark] text-[11px]"
                  title="To Date"
                />
              </div>
            )}
          </div>

          {/* Monthly Schedules Sync Button */}
          {dateFilterMode !== 'range' && dateFilterMode !== 'all' && (
            <button
              type="button"
              onClick={() => setShowMonthlySyncModal(true)}
              title="Weekly Schedule ↔ Daily Job Sheet Synchronization"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[12px] font-bold transition-all cursor-pointer shadow-xs ${
                monthlySyncStatus.pendingSyncCount > 0
                  ? 'bg-amber-400 hover:bg-amber-300 text-amber-950 border-amber-300 font-extrabold shadow-md'
                  : 'bg-white/15 hover:bg-white/25 text-white border-white/25'
              }`}
            >
              <Sparkles size={14} className={monthlySyncStatus.pendingSyncCount > 0 ? 'text-amber-950 animate-pulse' : 'text-emerald-300'} />
              <span>
                {monthlySyncStatus.pendingSyncCount > 0
                  ? `Fetch Monthly (${monthlySyncStatus.pendingSyncCount})`
                  : `Monthly Synced (${monthlySyncStatus.totalScheduled})`}
              </span>
            </button>
          )}

          {/* Backup / Send to Google Drive Button (Replaces Add Row) */}
          <button
            type="button"
            onClick={handleBackupToDrive}
            disabled={isBackingUp}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white font-bold text-[12px] border border-white/25 transition-all cursor-pointer shadow-xs disabled:opacity-50"
            title="Backup Excel sheet to Google Drive / VPS"
          >
            <CloudUpload size={14} className="text-emerald-300" />
            <span>{isBackingUp ? 'Backing up…' : 'Send to Google Drive'}</span>
          </button>

          {/* Save All Button */}
          <button
            type="button"
            onClick={handleSaveAll}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-black text-[12.5px] transition-all cursor-pointer shadow-md ${
              hasUnsavedChanges
                ? 'bg-amber-400 hover:bg-amber-300 text-amber-950 shadow-amber-900/40 ring-2 ring-white/80 animate-pulse'
                : 'bg-emerald-300 hover:bg-white text-[#0b5a2f]'
            }`}
            title="Save and synchronize back to main Daily Job Sheet (Ctrl+S)"
          >
            <Save size={14} />
            <span>{hasUnsavedChanges ? `Save ${pendingChanges.count} change${pendingChanges.count === 1 ? '' : 's'}` : 'Saved'}</span>
          </button>

          {/* Fullscreen Toggle */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer border border-white/20 ml-0.5"
            title={isFullscreen ? 'Exit Full Screen' : 'Toggle Full Screen'}
          >
            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        </div>
      </header>

      {/* ── Excel Menu Bar (File, Edit, View, Formulas) ── */}
      <nav className="bg-[#f8fafc] border-b border-slate-300 px-4 py-1 flex items-center justify-between text-[12px] select-none shrink-0 relative z-30">
        <div className="flex items-center gap-1">
          {/* File Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={e => {
                e.stopPropagation()
                setActiveMenu(activeMenu === 'file' ? null : 'file')
              }}
              className={`px-3 py-1 rounded font-semibold transition-colors flex items-center gap-1 ${activeMenu === 'file' ? 'bg-[#107c41] text-white' : 'hover:bg-slate-200 text-slate-700'}`}
            >
              <span>File</span>
              <ChevronDown size={11} />
            </button>
            {activeMenu === 'file' && (
              <div
                onClick={e => e.stopPropagation()}
                className="absolute top-full left-0 mt-1 w-56 bg-white border border-slate-200 rounded-xl shadow-xl py-1 z-50 text-[12px] animate-in fade-in zoom-in-95"
              >
                <button
                  onClick={() => { handleSaveAll(); setActiveMenu(null) }}
                  className="w-full px-3.5 py-2 text-left hover:bg-slate-100 flex items-center justify-between font-medium text-slate-700"
                >
                  <span className="flex items-center gap-2"><Save size={14} className="text-emerald-700" /> Save to CRM</span>
                  <kbd className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-400">Ctrl+S</kbd>
                </button>
                <button
                  onClick={() => { handleExportXLSX(); setActiveMenu(null) }}
                  className="w-full px-3.5 py-2 text-left hover:bg-slate-100 flex items-center gap-2 font-medium text-slate-700"
                >
                  <Download size={14} className="text-emerald-700" /> Export Excel (.xlsx)
                </button>
                <button
                  onClick={() => { handleExportCSV(); setActiveMenu(null) }}
                  className="w-full px-3.5 py-2 text-left hover:bg-slate-100 flex items-center gap-2 font-medium text-slate-700"
                >
                  <Download size={14} className="text-blue-600" /> Export CSV (.csv)
                </button>
                <button
                  onClick={() => { window.print(); setActiveMenu(null) }}
                  className="w-full px-3.5 py-2 text-left hover:bg-slate-100 flex items-center justify-between font-medium text-slate-700"
                >
                  <span className="flex items-center gap-2"><Printer size={14} className="text-slate-600" /> Print Sheet</span>
                  <kbd className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-400">Ctrl+P</kbd>
                </button>
                <div className="h-px bg-slate-100 my-1" />
                <button
                  onClick={() => {
                    const jobsForDay = dailyJobs.filter(j => j.date === selectedDate)
                    pushState(JSON.parse(JSON.stringify(jobsForDay)))
                    setActiveMenu(null)
                    showToast('Reset to saved CRM state')
                  }}
                  className="w-full px-3.5 py-2 text-left hover:bg-slate-100 flex items-center gap-2 font-medium text-slate-700"
                >
                  <RotateCcw size={14} className="text-amber-600" /> Revert to Saved
                </button>
              </div>
            )}
          </div>

          {/* Edit Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={e => {
                e.stopPropagation()
                setActiveMenu(activeMenu === 'edit' ? null : 'edit')
              }}
              className={`px-3 py-1 rounded font-semibold transition-colors flex items-center gap-1 ${activeMenu === 'edit' ? 'bg-[#107c41] text-white' : 'hover:bg-slate-200 text-slate-700'}`}
            >
              <span>Edit</span>
              <ChevronDown size={11} />
            </button>
            {activeMenu === 'edit' && (
              <div
                onClick={e => e.stopPropagation()}
                className="absolute top-full left-0 mt-1 w-60 bg-white border border-slate-200 rounded-xl shadow-xl py-1 z-50 text-[12px] animate-in fade-in zoom-in-95"
              >
                <button
                  onClick={() => { handleUndo(); setActiveMenu(null) }}
                  disabled={history.length === 0}
                  className="w-full px-3.5 py-2 text-left hover:bg-slate-100 disabled:opacity-40 flex items-center justify-between font-medium text-slate-700"
                >
                  <span className="flex items-center gap-2"><Undo2 size={14} /> Undo</span>
                  <kbd className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-400">Ctrl+Z</kbd>
                </button>
                <button
                  onClick={() => { handleRedo(); setActiveMenu(null) }}
                  disabled={future.length === 0}
                  className="w-full px-3.5 py-2 text-left hover:bg-slate-100 disabled:opacity-40 flex items-center justify-between font-medium text-slate-700"
                >
                  <span className="flex items-center gap-2"><Redo2 size={14} /> Redo</span>
                  <kbd className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-400">Ctrl+Y</kbd>
                </button>
                <div className="h-px bg-slate-100 my-1" />
                <button
                  onClick={() => {
                    const idx = activeCell ? activeCell.rowIdx : 0
                    insertRowAt(idx, 'above')
                    setActiveMenu(null)
                  }}
                  className="w-full px-3.5 py-2 text-left hover:bg-slate-100 flex items-center gap-2 font-medium text-slate-700"
                >
                  <ArrowUp size={14} className="text-emerald-700" /> Insert Row at Top (Above)
                </button>
                <button
                  onClick={() => {
                    const idx = activeCell ? activeCell.rowIdx : gridRows.length - 1
                    insertRowAt(idx, 'below')
                    setActiveMenu(null)
                  }}
                  className="w-full px-3.5 py-2 text-left hover:bg-slate-100 flex items-center gap-2 font-medium text-slate-700"
                >
                  <ArrowDown size={14} className="text-emerald-700" /> Insert Row at Bottom (Below)
                </button>
                {activeCell && (
                  <button
                    onClick={() => {
                      handleDuplicateRow(activeCell.rowIdx)
                      setActiveMenu(null)
                    }}
                    className="w-full px-3.5 py-2 text-left hover:bg-slate-100 flex items-center gap-2 font-medium text-slate-700"
                  >
                    <Copy size={14} className="text-blue-600" /> Duplicate Active Row
                  </button>
                )}
                {activeCell && (
                  <button
                    onClick={() => {
                      handleDeleteRow(activeCell.rowIdx)
                      setActiveMenu(null)
                    }}
                    className="w-full px-3.5 py-2 text-left hover:bg-red-50 text-red-600 flex items-center gap-2 font-medium"
                  >
                    <Trash2 size={14} /> Delete Active Row
                  </button>
                )}
              </div>
            )}
          </div>

          {/* View Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={e => {
                e.stopPropagation()
                setActiveMenu(activeMenu === 'view' ? null : 'view')
              }}
              className={`px-3 py-1 rounded font-semibold transition-colors flex items-center gap-1 ${activeMenu === 'view' ? 'bg-[#107c41] text-white' : 'hover:bg-slate-200 text-slate-700'}`}
            >
              <span>View</span>
              <ChevronDown size={11} />
            </button>
            {activeMenu === 'view' && (
              <div
                onClick={e => e.stopPropagation()}
                className="absolute top-full left-0 mt-1 w-64 bg-white border border-slate-200 rounded-xl shadow-xl py-1 z-50 text-[12px] animate-in fade-in zoom-in-95"
              >
                <button
                  onClick={() => { setViewMode(viewMode === 'blocks' ? 'flat' : 'blocks'); setActiveMenu(null) }}
                  className="w-full px-3.5 py-2 text-left hover:bg-slate-100 flex items-center justify-between font-medium text-slate-700"
                >
                  <span className="flex items-center gap-2"><Layers size={14} className="text-indigo-600" /> Group by Cleaner (Blocks)</span>
                  <input type="checkbox" checked={viewMode === 'blocks'} readOnly className="rounded accent-emerald-600" />
                </button>
                <button
                  onClick={() => { setShowFormulaBar(!showFormulaBar); setActiveMenu(null) }}
                  className="w-full px-3.5 py-2 text-left hover:bg-slate-100 flex items-center justify-between font-medium text-slate-700"
                >
                  <span className="flex items-center gap-2"><Calculator size={14} className="text-slate-600" /> Formula Bar (fx)</span>
                  <input type="checkbox" checked={showFormulaBar} readOnly className="rounded accent-emerald-600" />
                </button>
                <button
                  onClick={() => { resetColumnOrder(); setActiveMenu(null) }}
                  className="w-full px-3.5 py-2 text-left hover:bg-slate-100 flex items-center justify-between font-medium text-slate-700"
                >
                  <span className="flex items-center gap-2"><RotateCcw size={14} className="text-slate-600" /> Reset Column Order</span>
                </button>
                <div className="h-px bg-slate-100 my-1" />
                <div className="px-3.5 py-1.5 flex items-center justify-between text-[11px] text-slate-500 font-bold">
                  <span>Zoom Scale</span>
                  <div className="flex items-center gap-1">
                    {[90, 100, 110].map(z => (
                      <button
                        key={z}
                        onClick={() => setZoomLevel(z)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${zoomLevel === z ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                      >
                        {z}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Formulas Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={e => {
                e.stopPropagation()
                setActiveMenu(activeMenu === 'formulas' ? null : 'formulas')
              }}
              className={`px-3 py-1 rounded font-semibold transition-colors flex items-center gap-1 ${activeMenu === 'formulas' ? 'bg-[#107c41] text-white' : 'hover:bg-slate-200 text-slate-700'}`}
            >
              <span>Formulas</span>
              <ChevronDown size={11} />
            </button>
            {activeMenu === 'formulas' && (
              <div
                onClick={e => e.stopPropagation()}
                className="absolute top-full left-0 mt-1 w-64 bg-white border border-slate-200 rounded-xl shadow-xl py-1 z-50 text-[12px] animate-in fade-in zoom-in-95"
              >
                <button
                  onClick={() => { handleFormulaBarChange('=SUM(I)'); setActiveMenu(null) }}
                  className="w-full px-3.5 py-2 text-left hover:bg-slate-100 flex items-center justify-between font-medium text-slate-700"
                >
                  <span>AutoSum Charges (=SUM(I))</span>
                  <span className="font-mono text-[10px] text-emerald-700 font-bold">∑</span>
                </button>
                <button
                  onClick={() => { handleFormulaBarChange('=SUM(J)'); setActiveMenu(null) }}
                  className="w-full px-3.5 py-2 text-left hover:bg-slate-100 flex items-center justify-between font-medium text-slate-700"
                >
                  <span>AutoSum Received (=SUM(J))</span>
                  <span className="font-mono text-[10px] text-emerald-700 font-bold">∑</span>
                </button>
                <button
                  onClick={() => { handleFormulaBarChange('=AVERAGE(I)'); setActiveMenu(null) }}
                  className="w-full px-3.5 py-2 text-left hover:bg-slate-100 font-medium text-slate-700"
                >
                  Average Charges (=AVERAGE(I))
                </button>
                <button
                  onClick={() => { handleFormulaBarChange('=COUNT(B)'); setActiveMenu(null) }}
                  className="w-full px-3.5 py-2 text-left hover:bg-slate-100 font-medium text-slate-700"
                >
                  Count Staff Cleaners (=COUNT(B))
                </button>
                <div className="h-px bg-slate-100 my-1" />
                <button
                  onClick={() => { handleRecalculateHours(); setActiveMenu(null) }}
                  className="w-full px-3.5 py-2 text-left hover:bg-slate-100 flex items-center gap-2 font-medium text-emerald-800"
                >
                  <Sparkles size={14} className="text-emerald-600" /> Recalculate Duty & OT Hours
                </button>
              </div>
            )}
          </div>
        </div>

        {/* View Mode Switcher (Blocks vs Flat Grid) & Search */}
        <div className="flex items-center gap-3">
          {/* Mode Switcher: Flat Grid Mode first, Cleaner Blocks Mode second */}
          <div className="flex items-center bg-slate-200/80 p-0.5 rounded-lg text-[11px] font-bold text-slate-700">
            <button
              onClick={() => {
                setViewMode('flat')
                safeSet('safaeewala_excel_view_mode', 'flat')
              }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition-all cursor-pointer ${
                viewMode === 'flat' ? 'bg-white text-emerald-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Standard flat continuous Excel grid with cleaner blocks"
            >
              <Table size={13} className={viewMode === 'flat' ? 'text-emerald-700' : 'text-slate-500'} />
              <span>Flat Grid Mode</span>
            </button>
            <button
              onClick={() => {
                setViewMode('blocks')
                safeSet('safaeewala_excel_view_mode', 'blocks')
              }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition-all cursor-pointer ${
                viewMode === 'blocks' ? 'bg-white text-emerald-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Group jobs into colored blocks per cleaner (Daily Job Sheet style)"
            >
              <Layers size={13} className={viewMode === 'blocks' ? 'text-emerald-700' : 'text-slate-500'} />
              <span>Cleaner Blocks Mode</span>
            </button>
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-2 text-slate-400" />
            <input
              type="text"
              value={filterSearch}
              onChange={e => setFilterSearch(e.target.value)}
              placeholder="Search staff, location, mode..."
              title="Filter rows · Excel keys: arrows / Tab move, Enter or F2 edit, Delete clears, Ctrl+D fill down, Ctrl+V pastes a block"
              className="w-48 h-7 pl-8 pr-2.5 text-[11px] bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-600 focus:w-60 transition-all"
            />
            {filterSearch && (
              <button onClick={() => setFilterSearch('')} className="absolute right-2 top-2 text-slate-400 hover:text-slate-700">
                <X size={12} />
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* ── Autocomplete sources (UX-35): live employees and clients only (R-DATA-03) ── */}
      <datalist id="xl-staff">{staffOptions.map(n => <option key={n} value={n} />)}</datalist>
      <datalist id="xl-address">{addressOptions.map(n => <option key={n} value={n} />)}</datalist>
      <datalist id="xl-area">{areaOptions.map(n => <option key={n} value={n} />)}</datalist>
      <datalist id="xl-service">{serviceOptions.map(n => <option key={n} value={n} />)}</datalist>

      {/* ── Column presets (UX-39) ── */}
      <div className="mx-3 mt-2 flex items-center gap-2 text-[11.5px] text-slate-600 flex-wrap">
        <span className="font-bold">Columns:</span>
        {Object.keys(COLUMN_PRESETS).map(name => (
          <button key={name} type="button" onClick={() => applyColumnPreset(name)}
            className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-emerald-50 hover:border-emerald-400 font-semibold cursor-pointer">
            {name}
          </button>
        ))}
        <span className="ml-auto text-slate-400 hidden md:inline">Arrows/Tab move · Enter/F2 edit · Delete clears · Ctrl+D fill down · Ctrl+V paste block</span>
      </div>

      {/* ── Draft restore / remote change notices (AUD-48, UX-34) ── */}
      {draftOffer && (
        <div className="mx-3 mt-2 flex items-center justify-between gap-3 flex-wrap px-4 py-2.5 rounded-xl border border-sky-200 bg-sky-50 text-[12.5px] text-sky-900">
          <span>You have unsaved edits for this date from {new Date(draftOffer.savedAt).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', dateStyle: 'medium', timeStyle: 'short' })} (Dubai time).</span>
          <span className="flex gap-2">
            <button type="button" onClick={() => { pushState(draftOffer.rows); setDraftOffer(null); showToast('Draft restored — click Save to keep it') }}
              className="px-3 py-1 rounded-lg bg-sky-600 text-white font-bold hover:bg-sky-700 cursor-pointer">Restore edits</button>
            <button type="button" onClick={() => { setDraftOffer(null); try { localStorage.removeItem(DRAFT_PREFIX + periodKey) } catch { /* ignore */ } }}
              className="px-3 py-1 rounded-lg bg-white border border-sky-300 font-bold text-sky-800 hover:bg-sky-100 cursor-pointer">Discard</button>
          </span>
        </div>
      )}
      {remoteConflict && (
        <div className="mx-3 mt-2 flex items-center justify-between gap-3 flex-wrap px-4 py-2.5 rounded-xl border border-amber-200 bg-amber-50 text-[12.5px] text-amber-900">
          <span>Some rows you edited were also changed on another screen. Your edits are kept — Save asks before overwriting.</span>
          <button type="button" onClick={reloadFromSaved}
            className="px-3 py-1 rounded-lg bg-white border border-amber-300 font-bold text-amber-800 hover:bg-amber-100 cursor-pointer">Load latest instead</button>
        </div>
      )}

      {/* ── Excel Formula Bar (fx) ── */}
      {showFormulaBar && (
        <div className="bg-white border-b border-slate-300 px-4 py-1.5 flex items-center gap-2 text-[12.5px] shrink-0 shadow-2xs">
          {/* Active Cell Coordinates (e.g. B4) */}
          <div className="w-16 h-7 px-2 font-mono font-bold text-slate-700 bg-slate-100 border border-slate-300 rounded flex items-center justify-center text-[12px] shrink-0">
            {activeCellCoord}
          </div>

          {/* Fx Symbol */}
          <div className="w-7 h-7 flex items-center justify-center font-serif italic font-black text-slate-500 text-sm select-none shrink-0">
            fx
          </div>

          {/* Formula Input */}
          <div className="flex-1 relative">
            <input
              ref={formulaInputRef}
              type="text"
              value={formulaBarValue}
              onChange={e => handleFormulaBarChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  formulaInputRef.current?.blur()
                }
              }}
              placeholder="Type value or formula e.g. =SUM(I) or =I-J or =AVERAGE(I)... Right-click any row for Top/Bottom insertion"
              className="w-full h-7 px-2.5 font-mono text-[12px] bg-slate-50 border border-slate-300 rounded focus:bg-white focus:outline-none focus:border-[#107c41] focus:ring-1 focus:ring-[#107c41]"
            />
          </div>

          {/* Quick Formula Helpers & Column Customization */}
          <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200">
            <button
              type="button"
              onClick={() => handleFormulaBarChange(`=SUM(I)`)}
              className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 border border-slate-300 text-slate-600 transition-colors cursor-pointer"
              title="Insert Auto-Sum formula for Charges"
            >
              ∑ AutoSum
            </button>
            <button
              type="button"
              onClick={() => handleFormulaBarChange(`=I-J`)}
              className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 border border-slate-300 text-slate-600 transition-colors cursor-pointer"
              title="Insert Formula: Charges minus Received"
            >
              =I - J
            </button>
            <button
              type="button"
              onClick={resetColumnOrder}
              className="px-2 py-0.5 rounded text-[10.5px] font-bold bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-600 transition-colors cursor-pointer ml-1"
              title="Reset column sequence to Daily Job Sheet default"
            >
              Reset Columns
            </button>
            <button
              type="button"
              onClick={() => setShowColumnsModal(true)}
              className="w-6 h-6 rounded flex items-center justify-center bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 transition-colors cursor-pointer ml-1 shadow-2xs font-bold"
              title="Customize Columns: Reorder sequence & show/hide (Eye icon)"
            >
              <Eye size={13} className="stroke-[2.5]" />
            </button>
          </div>
        </div>
      )}

      {/* ── Main Spreadsheet Grid Container (Full Width Edge-to-Edge) ── */}
      <div className="flex-1 overflow-auto bg-white relative w-full">
        <table className="w-full border-collapse border border-slate-300 text-[12px] font-mono">
          {/* Header: Excel Column Letters (A, B, C...) */}
          <thead className="sticky top-0 z-20 bg-[#f3f4f6] text-slate-600 shadow-xs">
            <tr className="border-b border-slate-300">
              <th className="w-12 h-6 bg-[#e5e7eb] border-r border-slate-300 text-[11px] font-bold text-center select-none sticky left-0 z-30">
                #
              </th>
              {columns.map(col => (
                <th
                  key={col.col}
                  style={{ width: col.width }}
                  className={`h-6 border-r border-slate-300 text-center font-bold text-[11px] select-none ${
                    activeCell && columns.find(c => c.id === activeCell.colId)?.col === col.col
                      ? 'bg-emerald-200 text-emerald-950 font-black'
                      : 'bg-[#e5e7eb] text-slate-700'
                  }`}
                >
                  {col.col}
                </th>
              ))}
              <th className="w-14 border-r border-slate-300 bg-[#e5e7eb] text-[10px] font-bold">Act</th>
            </tr>

            {/* Column Label / Name Row with Drag & Drop */}
            <tr className="border-b-2 border-slate-400 bg-slate-100 text-slate-800 font-sans font-bold text-[11.5px]">
              <th className="w-12 h-7 bg-slate-200 border-r border-slate-300 text-center sticky left-0 z-30 font-mono text-[10px] text-slate-500">
                ROW
              </th>
              {columns.map(col => (
                <th
                  key={col.id}
                  draggable
                  onDragStart={e => handleDragStart(e, col.id)}
                  onDragOver={e => handleDragOver(e, col.id)}
                  onDrop={e => handleDrop(e, col.id)}
                  onDragEnd={() => { setDraggedColId(null); setDragOverColId(null) }}
                  style={{ width: col.width }}
                  className={`px-2.5 py-1.5 border-r border-slate-300 text-left whitespace-nowrap cursor-grab active:cursor-grabbing select-none transition-colors ${
                    dragOverColId === col.id ? 'bg-emerald-100 border-l-4 border-l-emerald-600' : ''
                  } ${draggedColId === col.id ? 'opacity-40' : ''}`}
                  title="Drag column to reorder sequence"
                >
                  <div className="flex items-center gap-1.5">
                    <GripVertical size={11} className="text-slate-400 shrink-0" />
                    <span>{col.label}</span>
                  </div>
                </th>
              ))}
              <th className="w-14 border-r border-slate-300 text-center text-[10.5px]">DEL</th>
            </tr>
          </thead>

          {/* ── Table Body: Cleaner Blocks Mode or Flat Grid Mode ── */}
          {viewMode === 'blocks' ? (
            /* 1. Cleaner Blocks Mode (Grouped by Cleaner in Separate Colored Blocks) */
            <tbody className="divide-y divide-slate-200">
              {cleanerGroups.map((group) => {
                const palette = group.palette

                return (
                  <React.Fragment key={group.cleanerName}>
                    {/* ── Cleaner Block Section Header Banner ── */}
                    <tr className={`${palette.headerBg} ${palette.headerText} border-t-2 border-b border-black/20 select-none shadow-xs`}>
                      <td colSpan={columns.length + 2} className="px-3 py-2">
                        <div className="flex items-center justify-between flex-wrap gap-2 font-sans">
                          {/* Left: Cleaner Info & Badges */}
                          <div className="flex items-center gap-3">
                            <span className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${palette.avatarBg} shadow-xs`}>
                              {group.cleanerName.trim()[0]?.toUpperCase() || 'C'}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-[14px] tracking-tight">{group.cleanerName}</span>
                              <span className={`text-[10.5px] font-bold px-2.5 py-0.5 rounded-full ${palette.badgeBg} ${palette.badgeText}`}>
                                {group.jobs.length} {group.jobs.length === 1 ? 'Shift' : 'Shifts'}
                              </span>
                              <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full ${palette.badgeBg} ${palette.badgeText}`}>
                                {group.totalDuty}h Duty
                              </span>
                              {group.totalOT > 0 && (
                                <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-amber-400 text-amber-950">
                                  +{group.totalOT}h OT
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Right: Block Summary, Color Selector & Add Job */}
                          <div className="flex items-center gap-3 font-mono text-[11px]">
                            <span>Charges: <strong>AED {group.totalCharges}</strong></span>
                            <span>·</span>
                            <span>Recv: <strong>AED {group.totalReceived}</strong></span>
                            {group.totalPending > 0 && (
                              <span className="bg-red-500 text-white font-bold px-1.5 py-0.5 rounded text-[10px]">
                                Due AED {group.totalPending}
                              </span>
                            )}

                            {/* Color Palette Selector Dropdown for this Cleaner Block */}
                            <div className="relative inline-block font-sans">
                              <button
                                type="button"
                                onClick={e => {
                                  e.stopPropagation()
                                  setColorPickerCleaner(colorPickerCleaner === group.cleanerName ? null : group.cleanerName)
                                }}
                                className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-black/20 hover:bg-black/30 text-white text-[11px] font-bold border border-white/20 transition-all cursor-pointer shadow-xs"
                                title="Change Block Color for this cleaner"
                              >
                                <span className="w-3 h-3 rounded-full border border-white/60" style={{ backgroundColor: palette.hex }} />
                                <span>{palette.name}</span>
                                <ChevronDown size={11} />
                              </button>

                                {colorPickerCleaner === group.cleanerName && (
                                  <div
                                    onClick={e => e.stopPropagation()}
                                    className="absolute top-full right-0 mt-1 w-64 bg-slate-900 text-white rounded-xl shadow-2xl border border-slate-700 p-2.5 z-50 text-[11.5px] font-sans animate-in fade-in"
                                  >
                                    <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-800">
                                      <span className="font-bold text-[11px] text-white flex items-center gap-1">
                                        <Palette size={12} className="text-emerald-400" />
                                        Colors
                                      </span>
                                      <div className="flex items-center bg-slate-800 p-0.5 rounded-lg border border-slate-700">
                                        <button
                                          type="button"
                                          onClick={() => setColorPaletteTab('solid')}
                                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                            colorPaletteTab === 'solid' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                                          }`}
                                        >
                                          Solid
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setColorPaletteTab('light')}
                                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                            colorPaletteTab === 'light' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                                          }`}
                                        >
                                          Light
                                        </button>
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-4 gap-1.5 max-h-60 overflow-y-auto p-1">
                                      {(colorPaletteTab === 'light' ? LIGHT_PALETTE_KEYS : SOLID_PALETTE_KEYS).map(pk => {
                                        const p = BLOCK_PALETTES[pk]
                                        const isSelected = palette.id === p.id
                                        return (
                                          <button
                                            key={p.id}
                                            type="button"
                                            onClick={() => setCleanerColor(group.cleanerName, p.id)}
                                            style={{ backgroundColor: p.solidBg, borderColor: p.solidBorder }}
                                            className={`flex flex-col items-center justify-center p-1 rounded-lg border-2 text-center transition-all cursor-pointer shadow-xs ${
                                              isSelected ? 'ring-2 ring-white ring-offset-1 ring-offset-slate-900 scale-105' : 'hover:border-white'
                                            }`}
                                            title={`${p.name} (${colorPaletteTab === 'light' ? 'Light' : 'Solid'})`}
                                          >
                                            <div className="flex items-center gap-0.5">
                                              <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/20" style={{ backgroundColor: p.hex }} />
                                              {isSelected && <Check size={9} className={p.isLight ? 'text-slate-900 stroke-[3]' : 'text-white stroke-[3]'} />}
                                            </div>
                                            <span className={`text-[9px] font-bold truncate max-w-[50px] mt-0.5 leading-none ${p.isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                                              {p.name.split(' ')[0]}
                                            </span>
                                          </button>
                                        )
                                      })}
                                    </div>
                                  </div>
                                )}
                            </div>

                            {/* + Add Shift for this Cleaner */}
                            <button
                              type="button"
                              onClick={() => {
                                const lastJobGlobalIdx = group.jobs[group.jobs.length - 1]?.globalIndex ?? (gridRows.length - 1)
                                insertRowAt(lastJobGlobalIdx, 'below', group.cleanerName)
                              }}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-white font-bold text-[11px] transition-colors cursor-pointer border border-white/30 shadow-xs font-sans"
                              title={`Add new job shift for ${group.cleanerName}`}
                            >
                              <Plus size={12} />
                              <span>Add Shift</span>
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>

                    {/* ── Cleaner's Shift Rows inside the Block ── */}
                    {group.jobs.map(({ row, globalIndex }) => {
                      const isSelectedRow = activeCell?.rowIdx === globalIndex

                      return (
                        <tr
                          key={row.id}
                          onContextMenu={e => handleContextMenu(e, globalIndex, row)}
                          style={{ backgroundColor: palette.solidBg }}
                          className={`transition-colors group hover:brightness-[0.97] ${
                            isSelectedRow
                              ? 'ring-2 ring-inset ring-emerald-600 font-semibold shadow-xs'
                              : ''
                          }`}
                        >
                          {/* Row Number Column (Sticky Left) */}
                          <td
                            onContextMenu={e => handleContextMenu(e, globalIndex, row)}
                            className={`w-12 h-7 border-r border-slate-300 text-center font-mono text-[11px] select-none sticky left-0 z-10 cursor-context-menu ${
                              isSelectedRow ? 'bg-emerald-600 text-white font-black' : 'bg-[#f3f4f6] text-slate-600'
                            }`}
                            title="Right-click to Add Row at Top / Bottom"
                          >
                            {globalIndex + 1}
                          </td>

                          {/* Render Cells */}
                          {columns.map(col => {
                            const isCellActive = activeCell?.rowIdx === globalIndex && activeCell?.colId === col.id
                            const isCellEditing = editingCell?.rowIdx === globalIndex && editingCell?.colId === col.id

                            let rawVal = row[col.id as keyof DailyJob]
                            let displayVal: any = rawVal

                            if (col.id === 'pending') {
                              displayVal = rowPending(row)
                            }
                            if (col.type === 'number') {
                              displayVal = cleanNum(displayVal)
                            }

                            return (
                              <td
                                key={col.id}
                                onClick={() => handleCellClick(globalIndex, col.id)}
                                onDoubleClick={() => handleCellDoubleClick(globalIndex, col.id)}
                                onContextMenu={e => handleContextMenu(e, globalIndex, row)}
                                style={{ width: col.width }}
                                className={`h-7 px-2 border-r border-slate-200 overflow-hidden text-ellipsis whitespace-nowrap cursor-cell transition-all relative ${
                                  isCellActive
                                    ? 'ring-2 ring-[#107c41] bg-white z-10 font-semibold'
                                    : ''
                                } ${col.type === 'number' || col.id === 'pending' ? 'text-right font-mono' : 'text-left'}`}
                              >
                                {isCellEditing ? (
                                  col.type === 'select' && col.options ? (
                                    <select
                                      ref={inputRef as any}
                                      value={editingCell.tempValue}
                                      onChange={e => setEditingCell({ ...editingCell, tempValue: e.target.value })}
                                      onBlur={commitCellEdit}
                                      onKeyDown={handleEditorKeyDown}
                                      className="w-full h-full bg-white text-[12px] font-mono border-0 outline-none p-0"
                                    >
                                      {col.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                    </select>
                                  ) : (
                                    <input
                                      ref={inputRef}
                                      type={col.type === 'date' ? 'date' : 'text'}
                                      list={AUTOCOMPLETE_LIST[col.id as string]}
                                      value={editingCell.tempValue}
                                      onChange={e => setEditingCell({ ...editingCell, tempValue: e.target.value })}
                                      onBlur={commitCellEdit}
                                      onKeyDown={handleEditorKeyDown}
                                      className="w-full h-full bg-white text-[12px] font-mono border-0 outline-none p-0 focus:ring-0"
                                    />
                                  )
                                ) : (
                                  <span className={
                                    col.id === 'charges'
                                      ? 'text-amber-300 font-black drop-shadow-xs'
                                      : col.id === 'received'
                                        ? 'text-emerald-300 font-black drop-shadow-xs'
                                        : col.id === 'pending' && cleanNum(displayVal) > 0
                                          ? 'text-rose-200 font-black bg-rose-950/80 px-1.5 py-0.5 rounded border border-rose-500/40 text-[11px]'
                                          : col.id === 'staff_name'
                                            ? 'font-black text-white tracking-wide'
                                            : 'text-slate-100 font-medium'
                                  }>
                                    {displayVal !== undefined && displayVal !== null && displayVal !== '' ? String(displayVal) : '—'}
                                  </span>
                                )}
                              </td>
                            )
                          })}

                          {/* Delete Row Column */}
                          <td className="w-14 border-r border-slate-200 text-center">
                            <button
                              onClick={() => handleDeleteRow(globalIndex)}
                              className="text-slate-400 hover:text-red-600 p-1 rounded transition-colors cursor-pointer"
                              title="Delete row"
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </React.Fragment>
                )
              })}
            </tbody>
          ) : (
            /* 2. Flat Continuous Grid Mode (With Cleaner Block Perimeter Borders & Solid Block Background) */
            <tbody className="divide-y divide-slate-200">
              {visibleGridRows.map((row, rowIdx) => {
                const globalIndex = gridRows.findIndex(r => r.id === row.id)
                const targetIdx = globalIndex >= 0 ? globalIndex : rowIdx
                const isSelectedRow = activeCell?.rowIdx === targetIdx
                const rawStaff = (row.staff_name || 'Unassigned Staff').trim()
                const staffKey = rawStaff.toLowerCase()
                const palette = getCleanerPalette(rawStaff, cleanerIndexMap.get(staffKey) ?? 0)

                // ── Cleaner Block Boundary Detection ──
                // Determine whether this row is the top or bottom boundary of a cleaner's block
                const prevStaff = rowIdx > 0 ? (visibleGridRows[rowIdx - 1]?.staff_name || 'Unassigned Staff').trim().toLowerCase() : null
                const nextStaff = rowIdx < visibleGridRows.length - 1 ? (visibleGridRows[rowIdx + 1]?.staff_name || 'Unassigned Staff').trim().toLowerCase() : null
                const isFirstInBlock = prevStaff !== staffKey
                const isLastInBlock = nextStaff !== staffKey

                // ── Cleaner Block 4-Sided Perimeter Borders (Top & Bottom on block boundaries, Left & Right on extremities) ──
                const blockTopBorder = isFirstInBlock ? `3.5px solid ${palette.solidBorder}` : '1px solid rgba(255, 255, 255, 0.12)'
                const blockBottomBorder = isLastInBlock ? `3.5px solid ${palette.solidBorder}` : '1px solid rgba(255, 255, 255, 0.12)'

                return (
                  <tr
                    key={row.id}
                    onContextMenu={e => handleContextMenu(e, targetIdx, row)}
                    style={{ backgroundColor: palette.solidBg }}
                    className={`transition-colors group hover:brightness-110 ${
                      isSelectedRow ? 'ring-2 ring-inset ring-white font-semibold shadow-xs' : ''
                    }`}
                  >
                    {/* Row Number (Block Left Perimeter Border: 5px solid matching cleaner color) */}
                    <td
                      onClick={e => handleContextMenu(e as any, targetIdx, row)}
                      onContextMenu={e => handleContextMenu(e, targetIdx, row)}
                      style={{
                        backgroundColor: isSelectedRow ? (palette.isLight ? '#059669' : '#047857') : palette.solidBg,
                        borderLeft: `5px solid ${palette.solidBorder}`,
                        borderTop: blockTopBorder,
                        borderBottom: blockBottomBorder,
                        borderRight: palette.isLight ? '1px solid #cbd5e1' : '1px solid rgba(255, 255, 255, 0.2)',
                      }}
                      className={`w-12 h-7.5 text-center font-mono text-[11px] select-none sticky left-0 z-10 cursor-pointer ${
                        isSelectedRow
                          ? 'text-white font-black'
                          : palette.isLight
                            ? 'text-slate-800 font-bold bg-slate-200/50'
                            : 'text-slate-200 font-bold'
                      }`}
                      title="Click or right-click to open Colors panel"
                    >
                      {rowIdx + 1}
                    </td>

                    {/* Columns (Solid Dark Background + Block Top/Bottom Perimeter Borders) */}
                    {columns.map(col => {
                      const isCellActive = activeCell?.rowIdx === targetIdx && activeCell?.colId === col.id
                      const isCellEditing = editingCell?.rowIdx === targetIdx && editingCell?.colId === col.id

                      let rawVal = row[col.id as keyof DailyJob]
                      let displayVal: any = rawVal

                      if (col.id === 'pending') {
                        displayVal = rowPending(row)
                      }
                      if (col.type === 'number') {
                        displayVal = cleanNum(displayVal)
                      }

                      return (
                        <td
                          key={col.id}
                          onClick={() => handleCellClick(targetIdx, col.id)}
                          onDoubleClick={() => handleCellDoubleClick(targetIdx, col.id)}
                          onContextMenu={e => handleContextMenu(e, targetIdx, row)}
                          style={{
                            width: col.width,
                            backgroundColor: isCellActive ? (palette.isLight ? '#ffffff' : '#090d16') : palette.solidBg,
                            borderTop: blockTopBorder,
                            borderBottom: blockBottomBorder,
                            borderRight: palette.isLight ? '1px solid #cbd5e1' : '1px solid rgba(255, 255, 255, 0.12)',
                          }}
                          className={`h-7.5 px-2 overflow-hidden text-ellipsis whitespace-nowrap cursor-cell transition-all relative ${
                            isCellActive
                              ? (palette.isLight ? 'ring-2 ring-emerald-600 bg-white z-10 font-bold text-slate-900 shadow-md' : 'ring-2 ring-emerald-400 bg-slate-950 z-10 font-bold text-white shadow-md')
                              : ''
                          } ${col.type === 'number' || col.id === 'pending' ? 'text-right font-mono' : 'text-left'}`}
                        >
                          {isCellEditing ? (
                            col.type === 'select' && col.options ? (
                              <select
                                ref={inputRef as any}
                                value={editingCell.tempValue}
                                onChange={e => setEditingCell({ ...editingCell, tempValue: e.target.value })}
                                onBlur={commitCellEdit}
                                onKeyDown={handleEditorKeyDown}
                                className={`w-full h-full text-[12px] font-mono border-0 outline-none p-0 ${palette.isLight ? 'bg-white text-slate-900' : 'bg-slate-900 text-white'}`}
                              >
                                {col.options.map(opt => <option key={opt} value={opt} className={palette.isLight ? 'bg-white text-slate-900' : 'bg-slate-900 text-white'}>{opt}</option>)}
                              </select>
                            ) : (
                              <input
                                ref={inputRef}
                                type={col.type === 'date' ? 'date' : 'text'}
                                list={AUTOCOMPLETE_LIST[col.id as string]}
                                value={editingCell.tempValue}
                                onChange={e => setEditingCell({ ...editingCell, tempValue: e.target.value })}
                                onBlur={commitCellEdit}
                                onKeyDown={handleEditorKeyDown}
                                className={`w-full h-full text-[12px] font-mono border-0 outline-none p-0 focus:ring-0 ${palette.isLight ? 'bg-white text-slate-900' : 'bg-slate-900 text-white'}`}
                              />
                            )
                          ) : (
                            <span className={
                              col.id === 'charges'
                                ? (palette.isLight ? 'text-indigo-950 font-black' : 'text-amber-300 font-black drop-shadow-xs')
                                : col.id === 'received'
                                  ? (palette.isLight ? 'text-emerald-950 font-black' : 'text-emerald-300 font-black drop-shadow-xs')
                                  : col.id === 'pending' && cleanNum(displayVal) > 0
                                    ? (palette.isLight ? 'text-rose-700 font-black bg-rose-100/90 px-1.5 py-0.5 rounded border border-rose-300 text-[11px]' : 'text-rose-200 font-black bg-rose-950/80 px-1.5 py-0.5 rounded border border-rose-500/40 text-[11px]')
                                    : col.id === 'staff_name'
                                      ? (palette.isLight ? 'font-black text-slate-900 tracking-wide' : 'font-black text-white tracking-wide')
                                      : (palette.isLight ? 'text-slate-800 font-medium' : 'text-slate-100 font-medium')
                            }>
                              {displayVal !== undefined && displayVal !== null && displayVal !== '' ? String(displayVal) : '—'}
                            </span>
                          )}
                        </td>
                      )
                    })}

                    {/* Delete Row Column (Block Right Perimeter Border: 5px solid matching cleaner color) */}
                    <td
                      style={{
                        backgroundColor: palette.solidBg,
                        borderRight: `5px solid ${palette.solidBorder}`,
                        borderTop: blockTopBorder,
                        borderBottom: blockBottomBorder,
                      }}
                      className="w-14 text-center"
                    >
                      <button
                        onClick={() => handleDeleteRow(targetIdx)}
                        className="text-slate-400 hover:text-red-600 p-1 rounded transition-colors cursor-pointer"
                        title="Delete row"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          )}

          {/* ── Table Footer Summary (Appears at end of table when scrolled down) ── */}
          <tfoot className="bg-slate-200/90 border-t-2 border-slate-400 font-mono text-[11.5px] select-none">
            <tr className="border-b border-slate-300 font-bold">
              <td className="w-12 h-8 bg-slate-300 border-r border-slate-400 text-center font-black text-slate-800">
                TOTAL
              </td>
              {columns.map(col => {
                if (col.id === 'charges') {
                  return (
                    <td key={col.id} style={{ width: col.width }} className="px-2 py-1.5 border-r border-slate-300 text-right font-black text-indigo-950">
                      AED {totals.totalCharges.toLocaleString()}
                    </td>
                  )
                }
                if (col.id === 'received') {
                  return (
                    <td key={col.id} style={{ width: col.width }} className="px-2 py-1.5 border-r border-slate-300 text-right font-black text-emerald-950">
                      AED {totals.totalReceived.toLocaleString()}
                    </td>
                  )
                }
                if (col.id === 'pending') {
                  return (
                    <td key={col.id} style={{ width: col.width }} className="px-2 py-1.5 border-r border-slate-300 text-right font-black text-rose-800">
                      AED {totals.totalPending.toLocaleString()}
                    </td>
                  )
                }
                if (col.id === 'duty_hours') {
                  return (
                    <td key={col.id} style={{ width: col.width }} className="px-2 py-1.5 border-r border-slate-300 text-right font-black text-slate-900">
                      {totals.totalDuty}h
                    </td>
                  )
                }
                if (col.id === 'ot_hours') {
                  return (
                    <td key={col.id} style={{ width: col.width }} className="px-2 py-1.5 border-r border-slate-300 text-right font-black text-amber-900">
                      {totals.totalOT}h
                    </td>
                  )
                }
                if (col.id === 'staff_name') {
                  return (
                    <td key={col.id} style={{ width: col.width }} className="px-2 py-1.5 border-r border-slate-300 text-left font-black text-slate-800 bg-emerald-100/60">
                      Total {cleanerGroups.length} Cleaners
                    </td>
                  )
                }
                return (
                  <td key={col.id} style={{ width: col.width }} className="px-2 py-1.5 border-r border-slate-300 text-slate-400">
                    —
                  </td>
                )
              })}
              <td className="w-14 border-r border-slate-300 text-center font-bold text-slate-400">
                —
              </td>
            </tr>
          </tfoot>
        </table>

        {/* Empty State */}
        {gridRows.length === 0 && (
          <div className="p-16 text-center text-slate-400">
            <FileSpreadsheet size={44} className="mx-auto text-slate-300 mb-2" />
            <p className="font-bold text-slate-600 text-[15px]">No jobs recorded for {fmtDate(selectedDate)}</p>
            <p className="text-[12px] text-slate-400 mt-0.5">Right-click anywhere to add entries in this spreadsheet.</p>
            <button
              onClick={handleAddRow}
              className="mt-4 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs transition-colors inline-flex items-center gap-1.5 shadow-sm"
            >
              <Plus size={14} /> Add First Row
            </button>
          </div>
        )}
      </div>

      {/* ── Right-Click Row Context Menu (Add Row at Top / Bottom) ── */}
      {contextMenu && (
        <div
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={e => e.stopPropagation()}
          className="fixed z-[200] w-80 max-h-[92vh] overflow-y-auto bg-white rounded-xl shadow-2xl border border-slate-300 py-2 text-[12px] font-sans animate-in fade-in zoom-in-95 select-none"
        >
          {/* Header */}
          <div className="px-3 py-1.5 border-b border-slate-100 flex items-center justify-between text-[11px] text-slate-400 font-bold">
            <span>ROW #{contextMenu.rowIdx + 1}</span>
            <span className="font-semibold text-slate-700 truncate max-w-[120px]">{contextMenu.job.staff_name}</span>
          </div>

          {/* Core User Requirements: Add Row at Top & Add Row at Bottom */}
          <div className="py-1">
            <button
              type="button"
              onClick={() => insertRowAt(contextMenu.rowIdx, 'above', contextMenu.job.staff_name)}
              className="w-full px-3.5 py-2 text-left hover:bg-emerald-50 text-slate-800 hover:text-emerald-900 flex items-center gap-2.5 font-semibold transition-colors cursor-pointer"
            >
              <ArrowUp size={15} className="text-emerald-700" />
              <span>Add Row at Top (Above)</span>
            </button>

            <button
              type="button"
              onClick={() => insertRowAt(contextMenu.rowIdx, 'below', contextMenu.job.staff_name)}
              className="w-full px-3.5 py-2 text-left hover:bg-emerald-50 text-slate-800 hover:text-emerald-900 flex items-center gap-2.5 font-semibold transition-colors cursor-pointer"
            >
              <ArrowDown size={15} className="text-emerald-700" />
              <span>Add Row at Bottom (Below)</span>
            </button>
          </div>

          <div className="h-px bg-slate-100 my-1" />

          {/* Secondary Actions */}
          <div className="py-0.5">
            <button
              type="button"
              onClick={() => handleDuplicateRow(contextMenu.rowIdx)}
              className="w-full px-3.5 py-1.5 text-left hover:bg-slate-100 text-slate-700 flex items-center gap-2.5 font-medium transition-colors cursor-pointer"
            >
              <Copy size={14} className="text-blue-600" />
              <span>Duplicate Row</span>
            </button>

            <button
              type="button"
              onClick={() => handleClearRow(contextMenu.rowIdx)}
              className="w-full px-3.5 py-1.5 text-left hover:bg-slate-100 text-slate-700 flex items-center gap-2.5 font-medium transition-colors cursor-pointer"
            >
              <RotateCcw size={14} className="text-amber-600" />
              <span>Clear Row Contents</span>
            </button>
          </div>

          <div className="h-px bg-slate-100 my-1" />

          {/* Color Selection Panel: Header changed to "Colors", with "Light" button to toggle 20 light styles */}
          <div className="px-3.5 py-2.5 bg-slate-900 text-white rounded-xl mx-2 border border-slate-800 shadow-md">
            {/* Header: Strictly "Colors" with [Solid] and [Light] toggle buttons */}
            <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-800">
              <div className="flex items-center gap-1.5 font-bold text-white text-[12px]">
                <Palette size={14} className="text-emerald-400" />
                <span>Colors</span>
                <span className="text-[10px] text-slate-400 font-normal">
                  ({colorPaletteTab === 'light' ? '20 Light' : '20 Solid'})
                </span>
              </div>
              
              {/* Toggle Buttons: Solid & Light (Clicking Light displays the 20 light colors) */}
              <div className="flex items-center bg-slate-800 p-0.5 rounded-lg border border-slate-700">
                <button
                  type="button"
                  onMouseDown={e => e.stopPropagation()}
                  onClick={e => {
                    e.stopPropagation()
                    setColorPaletteTab('solid')
                    safeSet('safaeewala_excel_color_tab', 'solid')
                  }}
                  className={`px-2.5 py-0.5 rounded-md text-[10.5px] font-bold transition-all cursor-pointer ${
                    colorPaletteTab === 'solid'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Show 20 Solid Dark Colors"
                >
                  Solid
                </button>
                <button
                  type="button"
                  onMouseDown={e => e.stopPropagation()}
                  onClick={e => {
                    e.stopPropagation()
                    setColorPaletteTab('light')
                    safeSet('safaeewala_excel_color_tab', 'light')
                  }}
                  className={`px-2.5 py-0.5 rounded-md text-[10.5px] font-bold transition-all cursor-pointer ${
                    colorPaletteTab === 'light'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Show 20 Light Colors"
                >
                  Light
                </button>
              </div>
            </div>

            {/* Target Cleaner Info */}
            <div className="flex items-center justify-between text-[11px] mb-2 px-0.5">
              <span className="text-slate-400 font-medium">Cleaner:</span>
              <span className="text-emerald-300 font-bold truncate max-w-[150px] bg-emerald-950/90 px-2 py-0.5 rounded border border-emerald-500/40">
                {contextMenu.job.staff_name || 'Staff'}
              </span>
            </div>

            {/* Grid of 20 Color Swatches (Solid or Light depending on active tab) */}
            <div className="grid grid-cols-4 gap-1.5 py-1">
              {(colorPaletteTab === 'light' ? LIGHT_PALETTE_KEYS : SOLID_PALETTE_KEYS).map(pk => {
                const p = BLOCK_PALETTES[pk]
                const currentPalette = getCleanerPalette(contextMenu.job.staff_name, 0)
                const isSelected = currentPalette.id === p.id
                return (
                  <button
                    key={p.id}
                    type="button"
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => {
                      e.stopPropagation()
                      setCleanerColor(contextMenu.job.staff_name, p.id)
                    }}
                    style={{ backgroundColor: p.solidBg, borderColor: p.solidBorder }}
                    className={`h-9 rounded-lg border-2 flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer shadow-sm hover:scale-105 relative ${
                      isSelected
                        ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900 scale-105 shadow-md'
                        : 'hover:border-white'
                    }`}
                    title={`${p.name} (${colorPaletteTab === 'light' ? 'Light' : 'Solid'})`}
                  >
                    <div className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/20" style={{ backgroundColor: p.hex }} />
                      {isSelected && (
                        <Check
                          size={10}
                          className={p.isLight ? 'text-slate-900 drop-shadow stroke-[3]' : 'text-white drop-shadow stroke-[3]'}
                        />
                      )}
                    </div>
                    <span
                      className={`text-[9px] font-bold truncate max-w-[62px] leading-tight px-0.5 ${
                        p.isLight ? 'text-slate-900' : 'text-slate-200'
                      }`}
                    >
                      {p.name.split(' ')[0]}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Footer */}
            <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10.5px] text-slate-400">
              <span>{colorPaletteTab === 'light' ? '20 Light Styles' : '20 Solid Styles'}</span>
              <button
                type="button"
                onMouseDown={e => e.stopPropagation()}
                onClick={e => {
                  e.stopPropagation()
                  const key = (contextMenu.job.staff_name || 'Unassigned Staff').trim().toLowerCase()
                  const updated = { ...cleanerColors }
                  delete updated[key]
                  setCleanerColors(updated)
                  safeSet('safaeewala_excel_cleaner_colors', updated)
                  setContextMenu(null)
                  setGridRows(prev => [...prev])
                  showToast(`Default color restored for ${contextMenu.job.staff_name}`)
                }}
                className="text-emerald-400 hover:text-emerald-300 underline font-semibold cursor-pointer"
              >
                Reset color
              </button>
            </div>
          </div>

          <div className="h-px bg-slate-100 my-1" />

          {/* Row history (UX-40) */}
          <div className="py-0.5">
            <button
              type="button"
              onClick={() => openRowHistory(contextMenu.job)}
              className="w-full px-3.5 py-1.5 text-left hover:bg-slate-50 text-slate-700 flex items-center gap-2.5 font-medium transition-colors cursor-pointer"
            >
              <History size={14} />
              <span>Row history</span>
            </button>
          </div>

          {/* Delete Row */}
          <div className="py-0.5">
            <button
              type="button"
              onClick={() => handleDeleteRow(contextMenu.rowIdx)}
              className="w-full px-3.5 py-1.5 text-left hover:bg-red-50 text-red-600 flex items-center gap-2.5 font-medium transition-colors cursor-pointer"
            >
              <Trash2 size={14} />
              <span>Delete Row</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Row history (UX-40) ── */}
      <Modal open={!!rowHistory} onClose={() => setRowHistory(null)} title={`Row history · ${rowHistory?.label || ''}`} size="md">
        {rowHistory?.loading ? (
          <p className="text-[12.5px] text-slate-400 py-6 text-center">Loading…</p>
        ) : rowHistory && rowHistory.entries.length === 0 ? (
          <p className="text-[12.5px] text-slate-400 py-6 text-center">No recorded changes for this row yet. History starts with this version; new unsaved rows have none.</p>
        ) : (
          <ul className="space-y-2 text-[12.5px]">
            {rowHistory?.entries.map(h => (
              <li key={h.id} className="rounded-xl border border-slate-200 px-3 py-2">
                <p className="font-bold text-slate-800">
                  {h.action} · {new Date(h.created_at).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', dateStyle: 'medium', timeStyle: 'short' })}
                  <span className="font-normal text-slate-500"> · {h.user_name || 'System'}</span>
                </p>
                {h.details && <p className="text-slate-600 mt-0.5">{h.details}</p>}
              </li>
            ))}
          </ul>
        )}
      </Modal>

      {/* ── Long periods: draw rows in pages (AUD-56, UX-38) ── */}
      {filteredGridRows.length > visibleGridRows.length && (
        <div className="px-5 py-2 bg-amber-50 border-t border-amber-200 text-[12px] text-amber-900 flex items-center justify-between shrink-0">
          <span>Showing {visibleGridRows.length.toLocaleString()} of {filteredGridRows.length.toLocaleString()} rows (totals include all rows).</span>
          <span className="flex gap-2">
            <button type="button" onClick={() => setRenderLimit(l => l + RENDER_PAGE)} className="px-3 py-1 rounded-lg bg-white border border-amber-300 font-bold hover:bg-amber-100 cursor-pointer">Show {RENDER_PAGE} more</button>
            <button type="button" onClick={() => setRenderLimit(filteredGridRows.length)} className="px-3 py-1 rounded-lg bg-white border border-amber-300 font-bold hover:bg-amber-100 cursor-pointer">Show all</button>
          </span>
        </div>
      )}

      {/* ── Status Bar / Footer (Sticky Bottom - Charges, Received, Pending, Duty, OT fixed) ── */}
      <footer className="bg-[#e5e7eb] border-t border-slate-300 px-5 py-2 text-[11.5px] text-slate-700 flex items-center justify-between shrink-0 select-none shadow-xs">
        <div className="flex items-center gap-3">
          <span className="font-bold text-emerald-800 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block animate-pulse" /> Ready
          </span>
          <span>·</span>
          <span className="font-bold">{gridRows.length} Total Rows</span>
          <span>·</span>
          <span className="text-slate-500">Tip: Click 'I' button to customize columns · Right-click row for options</span>
        </div>

        <div className="flex items-center gap-5 font-mono text-[12px] font-bold">
          <span>Charges: <strong className="text-indigo-950 font-black">AED {totals.totalCharges.toLocaleString()}</strong></span>
          <span>Received: <strong className="text-emerald-950 font-black">AED {totals.totalReceived.toLocaleString()}</strong></span>
          <span>Pending: <strong className="text-rose-700 font-black">AED {totals.totalPending.toLocaleString()}</strong></span>
          <span>Duty: <strong className="text-slate-900 font-black">{totals.totalDuty}h</strong></span>
          <span>OT: <strong className="text-amber-800 font-black">{totals.totalOT}h</strong></span>
        </div>
      </footer>

      {/* ── Columns Customization Pop-up Modal ── */}
      <Modal
        open={showColumnsModal}
        onClose={() => setShowColumnsModal(false)}
        title="Customize Columns (Sequence & Visibility)"
        size="md"
      >
        <div className="space-y-3.5">
          {/* Header Controls inside modal */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-bold text-slate-700">
                Sheet Columns:
              </span>
              <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                {columns.length} of {columnOrder.length} Visible
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={showAllColumns}
                className="text-[11px] font-bold px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors cursor-pointer"
              >
                Show All
              </button>
              <button
                type="button"
                onClick={resetColumnOrder}
                className="text-[11px] font-bold px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors cursor-pointer"
              >
                Reset Default
              </button>
            </div>
          </div>

          <p className="text-[11px] text-slate-500">
            Columns ka sequence drag-and-drop ya arrows say tabdeel karen, aur checkboxes say show ya hide karen:
          </p>

          {/* Draggable column list */}
          <div className="max-h-[380px] overflow-y-auto space-y-1.5 pr-1">
            {columnOrder.map((colId, idx) => {
              const def = DEFAULT_COLUMN_DEFS.find(c => c.id === colId)
              if (!def) return null
              const isHidden = hiddenColIds.includes(colId)
              const isDragging = modalDragId === colId
              const isOver = modalDragOverId === colId

              return (
                <div
                  key={colId}
                  draggable
                  onDragStart={e => handleModalDragStart(e, colId)}
                  onDragOver={e => handleModalDragOver(e, colId)}
                  onDrop={e => handleModalDrop(e, colId)}
                  onDragEnd={() => {
                    setModalDragId(null)
                    setModalDragOverId(null)
                  }}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl border text-[12px] transition-all select-none ${
                    isDragging
                      ? 'opacity-40 bg-slate-100 border-dashed border-slate-400'
                      : isOver
                      ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-400'
                      : isHidden
                      ? 'bg-slate-50/70 border-slate-200 opacity-60 text-slate-400'
                      : 'bg-white border-slate-200 hover:border-slate-300 shadow-2xs'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Drag Handle */}
                    <div
                      className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-700 p-0.5"
                      title="Drag to reorder sequence"
                    >
                      <GripVertical size={16} />
                    </div>

                    {/* Visibility Checkbox */}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!isHidden}
                        onChange={() => toggleColumnVisibility(colId)}
                        className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 accent-emerald-600 cursor-pointer"
                      />
                      <span className={`font-bold ${isHidden ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                        {def.label}
                      </span>
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Type Badge */}
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200 uppercase">
                      {def.type}
                    </span>

                    {/* Move Up / Down Buttons */}
                    <div className="flex items-center gap-0.5 ml-1">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => moveColumn(idx, -1)}
                        className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed"
                        title="Move column up"
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        type="button"
                        disabled={idx === columnOrder.length - 1}
                        onClick={() => moveColumn(idx, 1)}
                        className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed"
                        title="Move column down"
                      >
                        <ChevronDown size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Modal Footer Actions */}
          <div className="pt-2 border-t border-slate-200 flex justify-end">
            <button
              type="button"
              onClick={() => setShowColumnsModal(false)}
              className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs transition-colors cursor-pointer shadow-xs"
            >
              Done & Apply
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Google Drive & Webhook Setup Modal ── */}
      <GoogleDriveWebhookModal
        open={showDriveModal}
        onClose={() => setShowDriveModal(false)}
        selectedDate={selectedDate}
        todayJobsCount={gridRows.length}
        onSendBackupNow={handleBackupToDrive}
        isUploading={isBackingUp}
        driveStatus={driveStatus}
        driveLink={driveLink}
        driveError={driveError}
      />

      {/* ── Monthly Schedule Synchronization Modal ── */}
      {showMonthlySyncModal && (
        <MonthlyScheduleSyncModal
          open={showMonthlySyncModal}
          onClose={() => setShowMonthlySyncModal(false)}
          dateStr={effectiveTargetDate}
          clients={clients}
          dailyJobs={dailyJobs}
          onSyncAll={handleSyncAllMonthlyShifts}
          onSyncShift={handleSyncSingleShift}
          autoSyncEnabled={autoSyncMonthly}
          onToggleAutoSync={val => {
            setAutoSyncMonthly(val)
            safeLocalStorageSet('safaeewala_auto_sync_monthly_schedules', val)
          }}
        />
      )}
    </div>
  )
}
