import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import * as XLSX from 'xlsx'
import {
  ArrowLeft, FileSpreadsheet, Plus, Trash2, Save, Download,
  Upload, ChevronLeft, ChevronRight, RotateCcw, Calculator,
  Search, Check, X, Sparkles, Filter, Copy, HelpCircle,
  Maximize2, Minimize2, Undo2, Redo2, Palette, Layers, Table,
  Printer, MoreVertical, ChevronDown, ExternalLink, CornerDownLeft,
  ChevronUp, Eye, EyeOff, SlidersHorizontal, ArrowUp, ArrowDown, ArrowUpCircle, ArrowDownCircle,
  CloudUpload, Calendar, GripVertical, Info, History, Pencil, Edit2, Building2, Star
} from 'lucide-react'
import { AddJobForm } from '@/components/dailyJobSheet/AddJobModal'
import { SpreadsheetEditModal } from '@/components/dailyJobSheet/SpreadsheetEditModal'
import { Modal } from '@/components/ui/Modal'
import { QuickNewClientModal } from '@/components/common/QuickNewClientModal'
import { useData } from '@/store/DataContext'
import type { DailyJob, PaymentMode, MaterialType } from '@/types'
import {
  calcHours, calcOTHours, formatTimeOnly, formatTime12h, formatTime24h, cleanNum, fmtDate, addDaysToYMD, ROW_COLOR_PRESETS
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
  splitStaffNames,
  type ScheduledShiftPlan,
} from '@/lib/clientDataSync'
import { safeLocalStorageSet, safeLocalStorageGet } from '@/lib/storageUtils'
import { todayDubai } from '@/lib/dubaiTime'
import { confirmAsync } from '@/lib/notify'
import { invoicedJobIds } from '@/lib/receivables'
import { fetchRecordHistory, type AuditEntry } from '@/lib/auditLog'
import { ChangeLogHistoryModal } from '@/components/dailyJobSheet/ChangeLogHistoryModal'

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


/** Checks whether two time ranges overlap (supports 12h and 24h formats) */
export function checkTimesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  if (!startA || !endA || !startB || !endB || startA === '—' || endA === '—' || startB === '—' || endB === '—') return false
  const parseMin = (t: string): number | null => {
    const clean = t.trim().toUpperCase()
    const m = clean.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i)
    if (!m) return null
    let h = parseInt(m[1], 10)
    const min = parseInt(m[2], 10)
    const mer = m[3]
    if (mer === 'PM' && h < 12) h += 12
    if (mer === 'AM' && h === 12) h = 0
    return h * 60 + min
  }
  const sA = parseMin(startA)
  const eA = parseMin(endA)
  const sB = parseMin(startB)
  const eB = parseMin(endB)
  if (sA === null || eA === null || sB === null || eB === null) return false
  return sA < eB && sB < eA
}

/** Strips '(Monthly)' from address display and provides clean text */
export function cleanAddressDisplay(val: unknown): string {
  if (!val) return '—'
  const str = String(val).trim()
  if (!str) return '—'
  return str
    .replace(/\s*\(Monthly\)/gi, '')
    .replace(/\s*\[Monthly\]/gi, '')
    .replace(/\s+Monthly\s*$/i, '')
    .trim() || '—'
}

export function isAddressMonthly(val: unknown): boolean {
  if (!val) return false
  return /\(Monthly\)|\[Monthly\]|\bMonthly Client\b/i.test(String(val))
}

export const DEFAULT_COLUMN_DEFS: Omit<ColumnDef, 'col'>[] = [
  { id: 'staff_name',   label: 'Staff',      width: '150px', type: 'text',   formulaHint: 'Staff member name & team' },
  { id: 'start_time',   label: 'Start time', width: '100px', type: 'time',   formulaHint: 'e.g. 10:00 AM' },
  { id: 'end_time',     label: 'End time',   width: '100px', type: 'time',   formulaHint: 'e.g. 03:00 PM' },
  { id: 'address',      label: 'Address',    width: '230px', type: 'text',   formulaHint: 'Client name & address' },
  { id: 'area',         label: 'Location',   width: '125px', type: 'text',   formulaHint: 'Area or location' },
  { id: 'material',     label: 'Material',   width: '120px', type: 'select', options: ['No', 'Yes', 'Sofa', 'Ladder', 'Steam Cleaner', 'Deep Clean Kit'] },
  { id: 'charges',      label: 'Charges',    width: '95px',  type: 'number', formulaHint: 'Gross charges' },
  { id: 'received',     label: 'Received',   width: '95px',  type: 'number', formulaHint: 'Amount received' },
  { id: 'pending',      label: 'Pending',    width: '95px',  type: 'formula', formulaHint: 'Pending amount' },
  { id: 'duty_hours',   label: 'Duty Hrs',   width: '85px',  type: 'number', formulaHint: 'Duty hours' },
  { id: 'ot_hours',     label: 'OT',         width: '80px',  type: 'number', formulaHint: 'Overtime hours' },
  { id: 'payment_mode', label: 'Mode',       width: '95px',  type: 'select', options: ['Cash', 'Online', 'Monthly', 'Pending'] },
  { id: 'remarks',      label: 'Remarks',    width: '160px', type: 'text',   formulaHint: 'Remarks & notes' },
]

export function buildColumnsWithLetters(order: string[], hiddenIds: string[] = []): ColumnDef[] {
  const map = new Map<string, Omit<ColumnDef, 'col'>>(DEFAULT_COLUMN_DEFS.map(c => [c.id, c]))
  const validIds = order.filter(id => map.has(id) && id !== 'date' && id !== 'service' && id !== 'team_name')
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

export type ExcelDatePresetKey =
  | 'today'
  | 'yesterday'
  | 'last_month'
  | 'last_3_months'
  | 'last_6_months'
  | 'last_year'
  | 'two_years'
  | 'custom'
  | 'all'

export const EXCEL_DATE_PRESETS: { id: ExcelDatePresetKey; label: string; desc?: string }[] = [
  { id: 'today',         label: 'Today',         desc: 'Dubai current date' },
  { id: 'yesterday',     label: 'Yesterday',     desc: 'Previous day' },
  { id: 'last_month',    label: 'Last Month',    desc: 'Full previous calendar month' },
  { id: 'last_3_months', label: 'Last 3 Months', desc: 'Past 90 days to today' },
  { id: 'last_6_months', label: 'Last 6 Months', desc: 'Past 180 days to today' },
  { id: 'last_year',     label: 'Last Year',     desc: 'Past 365 days to today' },
  { id: 'two_years',     label: '2 Years',       desc: 'Past 2 years to today' },
  { id: 'custom',        label: 'Custom Range',  desc: 'Pick custom start & end date' },
  { id: 'all',           label: 'All',           desc: 'All available records' },
]


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
  white: {
    id: 'white',
    name: 'Pure White',
    headerBg: 'bg-white',
    headerText: 'text-slate-900',
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-800',
    rowBg: 'bg-white',
    rowBorder: 'border-slate-200',
    borderLeft: 'border-l-[5px] border-l-slate-300',
    avatarBg: 'bg-slate-100 text-slate-800 border border-slate-200',
    hex: '#ffffff',
    solidBg: '#ffffff',
    solidBorder: '#cbd5e1',
    hoverBg: '#f8fafc',
    isLight: true,
  },
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

export function isDarkHex(hex: string): boolean {
  if (!hex || !hex.startsWith('#')) return false
  const c = hex.substring(1)
  const rgb = parseInt(c.length === 3 ? c.split('').map(x => x + x).join('') : c, 16)
  if (isNaN(rgb)) return false
  const r = (rgb >> 16) & 0xff
  const g = (rgb >> 8) & 0xff
  const b = (rgb >> 0) & 0xff
  const luma = 0.299 * r + 0.587 * g + 0.114 * b
  return luma < 140
}

export function hslToHex(h: number, s: number, l: number): string {
  l /= 100
  const a = (s * Math.min(l, 1 - l)) / 100
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * color).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

export function makeHexPalette(hex: string): BlockPalette {
  const isDark = isDarkHex(hex)
  return {
    id: hex,
    name: `Custom (${hex.toUpperCase()})`,
    headerBg: isDark ? 'bg-slate-900' : 'bg-white',
    headerText: isDark ? 'text-white' : 'text-slate-900',
    badgeBg: isDark ? 'bg-slate-800' : 'bg-slate-100',
    badgeText: isDark ? 'text-slate-200' : 'text-slate-800',
    rowBg: hex,
    rowBorder: isDark ? 'border-slate-700' : 'border-slate-300',
    borderLeft: `border-l-[5px] border-l-[${hex}]`,
    avatarBg: isDark ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-800',
    hex,
    solidBg: hex,
    solidBorder: isDark ? '#334155' : '#cbd5e1',
    hoverBg: hex,
    isLight: !isDark,
  }
}

// ── Safe save helpers (AUD-49, UX-33, UX-34) ──
const SAVED_FIELDS = [
  'staff_name', 'start_time', 'end_time', 'duty_hours', 'ot_hours', 'address', 'area',
  'material', 'charges', 'received', 'payment_mode', 'remarks',
] as const
const NUMERIC_FIELDS = new Set<string>(['duty_hours', 'ot_hours', 'charges', 'received'])
const fieldValue = (row: DailyJob, k: (typeof SAVED_FIELDS)[number]) =>
  NUMERIC_FIELDS.has(k) ? cleanNum(row[k]) : String(row[k] ?? '').trim()
/** True when the two rows hold the same saved values */
const sameJobRow = (a: DailyJob, b: DailyJob) => SAVED_FIELDS.every(k => fieldValue(a, k) === fieldValue(b, k))
/** A new grid row the user never filled in — not worth saving */
const isBlankNewRow = (r: DailyJob) =>
  !String(r.address || '').trim() && !String(r.area || '').trim() && cleanNum(r.charges) === 0 &&
  cleanNum(r.received) === 0 && !String(r.remarks || '').trim()

export interface MultiCleanerPaymentInfo {
  isMultiCleaner: boolean
  isPrimary: boolean
  isSecondary: boolean
  primaryCleaner: string
  teamRef: string
  allCleaners: string[]
}

/**
 * Multi-Cleaner Payment Referencing Helper:
 * If multiple cleaners are assigned to the same address on that date:
 * - Primary cleaner row holds full charges & received payment.
 * - Secondary cleaner rows show reference to primary cleaner & team (e.g. "Included (Team A)", "Team A (Ref: Adnan)").
 */
export function getMultiCleanerPaymentInfo(row: DailyJob | undefined, allRows: DailyJob[]): MultiCleanerPaymentInfo | null {
  if (!row) return null

  // 1. Explicitly flagged secondary cleaner split shift
  if ((row as any)._isSecondaryCleaner) {
    return {
      isMultiCleaner: true,
      isPrimary: false,
      isSecondary: true,
      primaryCleaner: (row as any)._primaryCleanerName || 'Primary Cleaner',
      teamRef: (row as any)._teamReference || row.team_name || 'Team A',
      allCleaners: (row as any)._allCleaners || [],
    }
  }

  // 2. Identify shared address shifts on the same date
  const addr = (row.address || '').trim().toLowerCase()
  if (!addr || !row.start_time) return null

  const rowDate = row.date || todayDubai()
  const matchingRows = allRows.filter(r => {
    const rAddr = (r.address || '').trim().toLowerCase()
    const rDate = r.date || todayDubai()
    return rAddr === addr && rDate === rowDate && (r.staff_name || '').trim() && r.start_time
  })

  if (matchingRows.length <= 1) {
    if ((row as any)._isPrimaryCleaner) {
      return {
        isMultiCleaner: true,
        isPrimary: true,
        isSecondary: false,
        primaryCleaner: row.staff_name,
        teamRef: (row as any)._teamReference || row.team_name || 'Team A',
        allCleaners: [row.staff_name],
      }
    }
    return null
  }

  // Distinct cleaner names at this address
  const cleanerNames = Array.from(new Set(matchingRows.map(r => (r.staff_name || '').trim()))).filter(Boolean)
  if (cleanerNames.length <= 1) return null

  // Primary cleaner row: either has _isPrimaryCleaner, positive charges/received, or first row in sequence
  const primaryRow =
    matchingRows.find(r => (r as any)._isPrimaryCleaner) ||
    matchingRows.find(r => cleanNum(r.charges) > 0 || cleanNum(r.received) > 0) ||
    matchingRows[0]

  const isPrimary = row.id === primaryRow.id
  const teamRef = primaryRow.team_name || row.team_name || 'Team A'

  return {
    isMultiCleaner: true,
    isPrimary,
    isSecondary: !isPrimary,
    primaryCleaner: primaryRow.staff_name || 'Primary Cleaner',
    teamRef,
    allCleaners: cleanerNames,
  }
}

/** Ensures that every staff member present in the job list has at least 3 fixed rows (padded with blank shift rows) */
export function ensureThreeRowsPerStaff(jobs: DailyJob[], targetDate: string): DailyJob[] {
  if (jobs.length === 0) {
    return [0, 1, 2].map(() => ({
      id: newRowId('new_cleaner'),
      date: targetDate,
      staff_name: '',
      team_name: '',
      start_time: '',
      end_time: '',
      duty_hours: 0,
      ot_hours: 0,
      address: '',
      area: '',
      material: '' as any,
      charges: 0,
      received: 0,
      payment_mode: '' as any,
      remarks: '',
      is_overtime: false,
      created_at: new Date().toISOString(),
    }))
  }

  // 1. Pre-assign Team References to jobs with multiple cleaners
  const multiCleanerTeamMap = new Map<string, string>()
  let teamCounter = 0
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  jobs.forEach(job => {
    const cleaners = splitStaffNames(job.staff_name || '')
    if (cleaners.length > 1) {
      if (job.team_name && job.team_name.trim()) {
        multiCleanerTeamMap.set(job.id, job.team_name.trim())
      } else {
        multiCleanerTeamMap.set(job.id, `Team ${letters[teamCounter % letters.length]}`)
        teamCounter++
      }
    }
  })

  // 2. Expand multi-cleaner jobs into separate rows for each cleaner
  // Primary cleaner holds the charges & received amount so figures are accurate and not duplicated.
  // Secondary cleaners hold 0 charges/received and display team & primary cleaner references.
  const expandedJobs: DailyJob[] = []
  jobs.forEach(job => {
    const cleaners = splitStaffNames(job.staff_name || '')
    if (cleaners.length <= 1) {
      expandedJobs.push(job)
    } else {
      const teamRef = multiCleanerTeamMap.get(job.id) || job.team_name || 'Team A'
      const primaryCleaner = cleaners[0].trim()
      cleaners.forEach((cleaner, cIdx) => {
        const isPrimary = cIdx === 0
        expandedJobs.push({
          ...job,
          id: isPrimary ? job.id : `${job.id}-cleaner-${cleaner.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
          staff_name: cleaner.trim(),
          team_name: teamRef,
          charges: isPrimary ? cleanNum(job.charges) : 0,
          received: isPrimary ? cleanNum(job.received) : 0,
          payment_mode: isPrimary ? job.payment_mode : ('Above' as any),
          _isSplitShift: true,
          _isPrimaryCleaner: isPrimary,
          _isSecondaryCleaner: !isPrimary,
          _primaryCleanerName: primaryCleaner,
          _teamReference: teamRef,
          _allCleaners: cleaners,
          _cleanerIndex: cIdx + 1,
          _originalJobId: job.id,
        } as DailyJob)
      })
    }
  })

  // 3. Group expanded jobs by individual staff member
  const staffGroups = new Map<string, DailyJob[]>()
  const staffKeysOrder: string[] = []

  expandedJobs.forEach(job => {
    const key = (job.staff_name || '').trim().toLowerCase()
    if (!staffGroups.has(key)) {
      staffGroups.set(key, [])
      staffKeysOrder.push(key)
    }
    staffGroups.get(key)!.push(job)
  })

  const result: DailyJob[] = []
  staffKeysOrder.forEach(key => {
    const list = staffGroups.get(key)!
    const repName = list.find(j => (j.staff_name || '').trim())?.staff_name || ''
    result.push(...list)
    while (list.length < 3) {
      const blankRow: DailyJob = {
        id: newRowId(`blank_${key || 'unassigned'}`),
        date: targetDate,
        staff_name: repName,
        team_name: '',
        start_time: '',
        end_time: '',
        duty_hours: 0,
        ot_hours: 0,
        address: '',
        area: '',
        material: '' as any,
        charges: 0,
        received: 0,
        payment_mode: '' as any,
        remarks: '',
        is_overtime: false,
        created_at: new Date().toISOString(),
      }
      list.push(blankRow)
      result.push(blankRow)
    }
  })

  return result
}

const DRAFT_PREFIX = 'safaeewala_excel_draft:' // local only, never cloud-synced

/** Column presets (UX-39) — the columns each preset shows */
const COLUMN_PRESETS: Record<string, string[] | null> = {
  'All columns': null,
  Cashier: ['staff_name', 'team_name', 'address', 'material', 'charges', 'received', 'pending', 'payment_mode', 'remarks'],
  Payroll: ['staff_name', 'start_time', 'end_time', 'duty_hours', 'ot_hours', 'remarks'],
  Ops: ['staff_name', 'team_name', 'start_time', 'end_time', 'address', 'area', 'material', 'remarks'],
}
/** Temporary id for a grid row that is not saved yet */
const newRowId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
/** Columns that are calculated, never typed into */
const READ_ONLY_COLS = new Set(['pending'])
/** Time suggestions formatted with explicit AM and PM */
export const TIME_SUGGESTIONS = [
  '07:00 AM', '07:30 AM',
  '08:00 AM', '08:30 AM',
  '09:00 AM', '09:30 AM',
  '10:00 AM', '10:30 AM',
  '11:00 AM', '11:30 AM',
  '12:00 PM', '12:30 PM',
  '01:00 PM', '01:30 PM',
  '02:00 PM', '02:30 PM',
  '03:00 PM', '03:30 PM',
  '04:00 PM', '04:30 PM',
  '05:00 PM', '05:30 PM',
  '06:00 PM', '06:30 PM',
  '07:00 PM', '07:30 PM',
  '08:00 PM', '08:30 PM',
  '09:00 PM', '09:30 PM',
  '10:00 PM'
]
/** Cell editor → datalist id (UX-35) */
const AUTOCOMPLETE_LIST: Record<string, string> = {
  staff_name: 'xl-staff',
  area: 'xl-area'
}
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

  // ── Target Date Selection & Dynamic Date Presets ──
  const qDate = searchParams.get('date')
  const initialDate = qDate && /^\d{4}-\d{2}-\d{2}$/.test(qDate)
    ? qDate
    : todayDubai()
  const [selectedDate, setSelectedDate] = useState(initialDate)
  // Default display is Date Range function as requested
  const [dateFilterMode, setDateFilterMode] = useState<'single' | 'today' | 'yesterday' | 'range' | 'all'>('range')
  const [rangeStart, setRangeStart] = useState<string>(initialDate)
  const [rangeEnd, setRangeEnd] = useState<string>(initialDate)
  const [activeDatePreset, setActiveDatePreset] = useState<
    'today' | 'yesterday' | 'last_month' | 'last_3_months' | 'last_6_months' | 'last_year' | 'two_years' | 'custom' | 'all'
  >('today')
  const [showDatePresetDropdown, setShowDatePresetDropdown] = useState(false)
  const datePresetRef = useRef<HTMLDivElement>(null)
  const threeDotRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (datePresetRef.current && !datePresetRef.current.contains(e.target as Node)) {
        setShowDatePresetDropdown(false)
      }
      if (threeDotRef.current && !threeDotRef.current.contains(e.target as Node)) {
        setShowThreeDotMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // ── Weekly Schedule ↔ Daily Job Sheet Synchronization State ──
  const [showMonthlySyncModal, setShowMonthlySyncModal] = useState(false)
  const [autoSyncMonthly, setAutoSyncMonthly] = useState<boolean>(() => {
    return safeLocalStorageGet('safaeewala_auto_sync_monthly_schedules', true)
  })
  const autoSyncedDatesRef = useRef<Set<string>>(new Set())

  const effectiveTargetDate = useMemo(() => {
    if (dateFilterMode === 'today') return todayDubai()
    if (dateFilterMode === 'yesterday') return addDaysToYMD(todayDubai(), -1)
    if (rangeStart) return rangeStart
    return selectedDate
  }, [selectedDate, dateFilterMode, rangeStart])

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
    const saved = safeLocalStorageGet<string[]>('safaeewala_excel_columns_order_v6', [])
    if (!Array.isArray(saved) || saved.length === 0) return defaultList
    const valid = saved.filter(id => defaultList.includes(id as any) && id !== 'service')
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

  // Dynamic client & building options formatted identical to Add Job Entry selector
  const clientBuildingList = useMemo(() => {
    const list: { key: string; building: string; name: string; area: string; isMonthly: boolean; client: any }[] = []
    const seen = new Set<string>()
    clients.forEach(c => {
      const bldg = (c.building_name || c.full_name || '').trim()
      if (bldg && !seen.has(bldg.toLowerCase())) {
        seen.add(bldg.toLowerCase())
        list.push({
          key: c.id || bldg,
          building: bldg,
          name: c.full_name || bldg,
          area: c.area || '',
          isMonthly: !!(c.service_days && c.service_days.length > 0) || (c as any).contract_type === 'Monthly' || (c as any).client_type === 'Monthly',
          client: c
        })
      }
    })
    return list
  }, [clients])

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
      safeLocalStorageSet('safaeewala_excel_columns_order_v5', next)
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
      safeLocalStorageSet('safaeewala_excel_columns_order_v5', next)
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
      safeLocalStorageSet('safaeewala_excel_columns_order_v5', next)
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
    safeLocalStorageSet('safaeewala_excel_columns_order_v5', def)
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
  const [excelCustomMaterial, setExcelCustomMaterial] = useState('')

  // Filtered Client & Building list for Address dropdown matching Add Job Entry selector
  const filteredClientBuildings = useMemo(() => {
    if (!editingCell || editingCell.colId !== 'address') return clientBuildingList
    const q = editingCell.tempValue.toLowerCase().trim()
    if (!q) return clientBuildingList
    return clientBuildingList.filter(item =>
      item.building.toLowerCase().includes(q) ||
      item.name.toLowerCase().includes(q) ||
      item.area.toLowerCase().includes(q)
    )
  }, [clientBuildingList, editingCell])
  // What the grid was loaded from — Save All writes only the differences (AUD-49)
  const [loadedSnapshot, setLoadedSnapshot] = useState<Map<string, DailyJob>>(() => new Map())
  const [remoteConflict, setRemoteConflict] = useState(false)
  const [draftOffer, setDraftOffer] = useState<{ rows: DailyJob[]; savedAt: number } | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [showThreeDotMenu, setShowThreeDotMenu] = useState(false)
  const [showAddJobModal, setShowAddJobModal] = useState(false)
  const [editingRowState, setEditingRowState] = useState<{ row: DailyJob; index: number } | null>(null)
  const [quickClientState, setQuickClientState] = useState<{ open: boolean; rowIdx: number | null; name: string }>({ open: false, rowIdx: null, name: '' })
  const [paymentModeFilter, setPaymentModeFilter] = useState<'ALL' | 'Monthly' | 'Cash' | 'Online' | 'Pending' | 'Project'>('ALL')

  // ── Custom Color Slider & Favorites (Hue & Brightness) ──
  const [customHue, setCustomHue] = useState(180)
  const [customLightness, setCustomLightness] = useState(82)
  const [favoriteColors, setFavoriteColors] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('safaeewala_favorite_colors')
      if (raw) return JSON.parse(raw)
    } catch {}
    return ['#ffffff', '#fef3c7', '#dcfce7', '#e0f2fe', '#ede9fe', '#ffe4e6', '#ccfbf1', '#fed7aa']
  })
  const currentCustomHex = useMemo(() => {
    return hslToHex(customHue, 80, customLightness)
  }, [customHue, customLightness])

  const handleSaveFavoriteColor = (hex: string) => {
    const normalized = hex.toLowerCase()
    if (favoriteColors.map(c => c.toLowerCase()).includes(normalized)) {
      showToast('Color is already in favorites')
      return
    }
    const updated = [hex, ...favoriteColors.slice(0, 9)]
    setFavoriteColors(updated)
    safeSet('safaeewala_favorite_colors', JSON.stringify(updated))
    showToast(`✓ Color ${hex.toUpperCase()} saved to favorites`)
  }

  const handleRemoveFavoriteColor = (hex: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const updated = favoriteColors.filter(c => c.toLowerCase() !== hex.toLowerCase())
    setFavoriteColors(updated)
    safeSet('safaeewala_favorite_colors', JSON.stringify(updated))
  }

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
    return safeGet('safaeewala_excel_color_tab', 'light')
  })

  // ── Column Background Colors (Granular column color customization) ──
  const [columnColors, setColumnColors] = useState<Record<string, string>>(() => {
    return safeGet('safaeewala_excel_column_colors', {})
  })

  // ── Cell Background Colors (Granular single-cell color customization) ──
  const [cellColors, setCellColors] = useState<Record<string, string>>(() => {
    return safeGet('safaeewala_excel_cell_colors', {})
  })

  // ── Change Log History Modal ──
  const [showChangeLogModal, setShowChangeLogModal] = useState(false)

  // ── Column Widths (Interactive Drag Resizing) ──
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    return safeGet('safaeewala_excel_column_widths', {})
  })
  const [resizingCol, setResizingCol] = useState<{ id: string; startX: number; startWidth: number } | null>(null)

  const handleStartResize = (e: React.MouseEvent, colId: string, currentWidthPx: number) => {
    e.preventDefault()
    e.stopPropagation()
    setResizingCol({
      id: colId,
      startX: e.clientX,
      startWidth: currentWidthPx,
    })
  }

  useEffect(() => {
    if (!resizingCol) return

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - resizingCol.startX
      const newWidth = Math.max(55, resizingCol.startWidth + deltaX)
      setColWidths(prev => ({
        ...prev,
        [resizingCol.id]: newWidth,
      }))
    }

    const handleMouseUp = () => {
      setColWidths(prev => {
        safeSet('safaeewala_excel_column_widths', prev)
        return prev
      })
      setResizingCol(null)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [resizingCol])

  const getColWidth = (col: ColumnDef): number => {
    if (colWidths[col.id]) return colWidths[col.id]
    const parsed = parseInt(col.width || '100', 10)
    return isNaN(parsed) ? 100 : parsed
  }

  // ── Right-Click Context Menu State ──
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    rowIdx: number
    job: DailyJob
    colId: string
  } | null>(null)

  // Granular color target for non-staff cells: 'cell' (only this specific cell) vs 'row' (only this row)
  const [colorTargetScope, setColorTargetScope] = useState<'cell' | 'row'>('cell')

  // Palette picker open for specific cleaner
  const [colorPickerCleaner, setColorPickerCleaner] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const formulaInputRef = useRef<HTMLInputElement>(null)
  const spreadsheetRef = useRef<HTMLDivElement>(null)

  // Jobs of the period shown in the grid
  const periodKey = `${dateFilterMode}|${selectedDate}|${rangeStart}|${rangeEnd}|${activeDatePreset}`
  const periodJobs = useMemo(() => {
    if (dateFilterMode === 'all') return [...dailyJobs]
    if (dateFilterMode === 'range') {
      if (rangeStart && rangeEnd) {
        return dailyJobs.filter(j => j.date >= rangeStart && j.date <= rangeEnd)
      } else if (rangeStart) {
        return dailyJobs.filter(j => j.date >= rangeStart)
      } else if (rangeEnd) {
        return dailyJobs.filter(j => j.date <= rangeEnd)
      }
      return [...dailyJobs]
    }
    if (dateFilterMode === 'today') { const t = todayDubai(); return dailyJobs.filter(j => j.date === t) }
    if (dateFilterMode === 'yesterday') { const y = addDaysToYMD(todayDubai(), -1); return dailyJobs.filter(j => j.date === y) }
    return dailyJobs.filter(j => j.date === selectedDate)
  }, [dailyJobs, dateFilterMode, selectedDate, rangeStart, rangeEnd, activeDatePreset])

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
      const rows = ensureThreeRowsPerStaff(clone(periodJobs), effectiveTargetDate)
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
      setShowThreeDotMenu(false)
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
    if (row) {
      const mcInfo = getMultiCleanerPaymentInfo(row, gridRows)
      if (mcInfo?.isSecondary && (colId === 'charges' || colId === 'received' || colId === 'pending')) {
        setActiveCell({ rowIdx, colId })
        showToast(`ℹ️ Payment for this team shift is recorded under lead cleaner: ${mcInfo.primaryCleaner}`)
        return
      }
    }
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
    staff_name: '',
    start_time: '', end_time: '', duty_hours: 0, ot_hours: 0, address: '', area: '',
    charges: 0, received: 0, payment_mode: 'Cash', is_overtime: false, material: 'No', remarks: '',
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

    // ── Conflict / Overlap Error Handling: Detect if cleaner is already assigned/engaged at this time ──
    const targetStaff = colId === 'staff_name' ? trimmed : (row.staff_name || '')
    const targetStart = colId === 'start_time' ? (row.start_time || '') : (row.start_time || '')
    const targetEnd = colId === 'end_time' ? (row.end_time || '') : (row.end_time || '')
    if (targetStaff && targetStart && targetEnd && targetStart !== '—' && targetEnd !== '—') {
      const staffKey = targetStaff.trim().toLowerCase()
      const clashingJob = updated.find((other, oIdx) => {
        if (oIdx === rowIdx) return false
        if ((other.staff_name || '').trim().toLowerCase() !== staffKey) return false
        if (!other.start_time || !other.end_time || other.start_time === '—' || other.end_time === '—') return false
        return checkTimesOverlap(targetStart, targetEnd, other.start_time, other.end_time)
      })
      if (clashingJob) {
        showToast(`⚠️ Cleaner Clash Error: ${targetStaff} is already engaged from ${clashingJob.start_time} to ${clashingJob.end_time}!`)
      }
    }

    // If editing staff_name, synchronize all rows in this staff member's block so they stay together
    if (colId === 'staff_name') {
      const oldStaff = (gridRows[rowIdx]?.staff_name || '').trim().toLowerCase()
      if (oldStaff && trimmed.toLowerCase() !== oldStaff) {
        updated.forEach(r => {
          if ((r.staff_name || '').trim().toLowerCase() === oldStaff) {
            r.staff_name = trimmed
          }
        })
      } else {
        // If it was a blank staff block, update all rows in this block
        const targetBlock = staffBlockInfoMap.get(row.id)
        if (targetBlock && !targetBlock.staffName) {
          const startIndex = rowIdx - targetBlock.blockRowIdx
          for (let i = 0; i < targetBlock.rowCount; i++) {
            if (updated[startIndex + i]) updated[startIndex + i].staff_name = trimmed
          }
        }
      }
    }

    // Automatic check: If editing Client column and client is not in system, trigger Quick Registration modal
    if (colId === 'address' && trimmed.length > 1) {
      const isRegistered = clients.some(c =>
        c.full_name?.toLowerCase().trim() === trimmed.toLowerCase() ||
        c.building_name?.toLowerCase().trim() === trimmed.toLowerCase() ||
        `${c.full_name} (${c.building_name || c.area})`.toLowerCase().trim() === trimmed.toLowerCase()
      )
      if (!isRegistered) {
        setQuickClientState({
          open: true,
          rowIdx,
          name: trimmed,
        })
      }
    }

    updated[rowIdx] = row
    pushState(updated)
    setEditingCell(null)
    return updated
  }

  // Quick Commit for Address / Building Dropdown Selection
  const commitAddressSelect = (rowIdx: number, building: string, area?: string, mode?: string) => {
    const updated = [...gridRows]
    const row = { ...updated[rowIdx] }
    row.address = building
    if (area && !row.area) row.area = area
    if (mode === 'Monthly') row.payment_mode = 'Monthly'
    updated[rowIdx] = row
    pushState(updated)
    setEditingCell(null)
  }

  // Quick Commit for Material Selection or Custom Material Addition
  const commitMaterialSelect = (rowIdx: number, val: string) => {
    const updated = [...gridRows]
    const row = { ...updated[rowIdx] }
    row.material = val as any
    updated[rowIdx] = row
    pushState(updated)
    setEditingCell(null)
    showToast(`✓ Material set to "${val}"`)
  }

  // Unified Interactive Cell Editor matching all UX requirements (Stabilized against flickering & fluctuations)
  const renderCellEditor = (col: ColumnDef, targetIdx: number, isLightBg: boolean = true) => {
    if (!editingCell || editingCell.rowIdx !== targetIdx || editingCell.colId !== col.id) return null
    const isNearBottom = targetIdx >= Math.max(1, visibleGridRows.length - 4)

    // 1. Address Column Dropdown (Standardized matching Add Job Entry selector to prevent fluctuation & flicker)
    if (col.id === 'address') {
      return (
        <div className="relative w-full h-7 flex items-center">
          <input
            ref={inputRef}
            type="text"
            value={editingCell.tempValue}
            onChange={e => setEditingCell({ ...editingCell, tempValue: e.target.value })}
            onKeyDown={e => {
              if (e.key === 'Escape') setEditingCell(null)
              else if (e.key === 'Enter') commitCellEdit()
            }}
            placeholder="Type or search building..."
            className={`w-full h-full text-[12px] font-semibold border-0 outline-none px-1 py-0 focus:ring-0 ${isLightBg ? 'bg-white text-slate-900' : 'bg-slate-900 text-white'}`}
          />
          <div
            onMouseDown={e => {
              e.preventDefault()
              e.stopPropagation()
            }}
            className={`absolute z-[100] left-0 ${
              isNearBottom ? 'bottom-full mb-1' : 'top-full mt-1'
            } w-84 max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-2xl shadow-2xl p-2.5 text-slate-800 text-[12px] animate-in fade-in select-none`}
          >
            {editingCell.tempValue.trim() && (
              <div
                onMouseDown={() => commitAddressSelect(targetIdx, editingCell.tempValue.trim())}
                className="px-3 py-2 rounded-xl bg-emerald-50 text-emerald-900 hover:bg-emerald-100 text-[11.5px] font-bold flex items-center gap-2 cursor-pointer mb-2 shrink-0 transition-colors"
              >
                <Plus size={13} className="text-emerald-700 stroke-[3]" />
                <span>Use custom address: &ldquo;{editingCell.tempValue.trim()}&rdquo;</span>
              </div>
            )}
            <div className="space-y-0.5 divide-y divide-slate-100">
              {filteredClientBuildings.slice(0, 35).map(item => (
                <div
                  key={item.key}
                  onMouseDown={() => commitAddressSelect(targetIdx, item.building, item.area, item.isMonthly ? 'Monthly' : undefined)}
                  className="px-3 py-1.5 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer text-left flex items-center justify-between"
                >
                  <div className="min-w-0 pr-2">
                    <div className="text-[12px] font-bold text-slate-900 flex items-center gap-1.5 truncate">
                      <Building2 size={13} className="text-slate-400 shrink-0" />
                      <span className="truncate">{item.building}</span>
                    </div>
                    {item.name !== item.building && (
                      <p className="text-[10.5px] text-slate-500 truncate mt-0.5">{item.name}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {item.area && (
                      <span className="px-2 py-0.5 rounded-full text-[9.5px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                        {item.area}
                      </span>
                    )}
                    <span className={`px-2 py-0.5 rounded-full text-[9.5px] font-bold ${
                      item.isMonthly ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {item.isMonthly ? 'Monthly' : 'Regular'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )
    }

    // 2. Material Column Dropdown (Standardized matching Add Job Entry pop-up with custom entry & tick/cross)
    if (col.id === 'material') {
      const standardMaterials = [
        'No', 'Yes', 'Chemicals Only', 'Machines Only', 'Sofa Kit', 'Ladder', 'Steam Cleaner', 'Deep Clean Kit'
      ]
      return (
        <div className="relative w-full h-7 flex items-center">
          <input
            ref={inputRef}
            type="text"
            value={editingCell.tempValue}
            onChange={e => setEditingCell({ ...editingCell, tempValue: e.target.value })}
            onKeyDown={e => {
              if (e.key === 'Enter') commitCellEdit()
              else if (e.key === 'Escape') setEditingCell(null)
            }}
            placeholder="Material..."
            className={`w-full h-full text-[12px] font-semibold border-0 outline-none px-1 py-0 focus:ring-0 ${isLightBg ? 'bg-white text-slate-900' : 'bg-slate-900 text-white'}`}
          />
          <div
            onMouseDown={e => {
              e.preventDefault()
              e.stopPropagation()
            }}
            className={`absolute z-[100] left-0 ${
              isNearBottom ? 'bottom-full mb-1' : 'top-full mt-1'
            } w-64 bg-white border border-slate-200 rounded-2xl shadow-2xl p-2 text-slate-800 text-[12px] animate-in fade-in select-none`}
          >
            <div className="px-2.5 py-1 text-[10px] font-black uppercase text-slate-400 border-b border-slate-100 mb-1">
              Select Material
            </div>
            <div className="space-y-0.5 max-h-48 overflow-y-auto pr-0.5">
              {standardMaterials.map(mat => {
                const isSelected = editingCell.tempValue.toLowerCase() === mat.toLowerCase()
                return (
                  <div
                    key={mat}
                    onMouseDown={() => commitMaterialSelect(targetIdx, mat)}
                    className={`px-2.5 py-1.5 rounded-xl hover:bg-amber-50/60 transition-colors cursor-pointer text-left font-medium flex items-center justify-between text-[11.5px] ${
                      isSelected ? 'bg-amber-50 text-amber-950 font-bold' : 'text-slate-700'
                    }`}
                  >
                    <span>{mat === 'No' ? 'No Material' : mat}</span>
                    {isSelected && (
                      <Check size={13} className="text-amber-700 stroke-[3]" />
                    )}
                  </div>
                )
              })}
            </div>

            {/* Custom Material Input with Save Check and Cancel button (matching AddJobModal) */}
            <div className="pt-2 mt-1.5 border-t border-slate-100 shrink-0">
              <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-xl border border-slate-200">
                <input
                  type="text"
                  placeholder="Type custom material…"
                  value={excelCustomMaterial}
                  onChange={e => setExcelCustomMaterial(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      if (excelCustomMaterial.trim()) {
                        commitMaterialSelect(targetIdx, excelCustomMaterial.trim())
                        setExcelCustomMaterial('')
                      }
                    }
                  }}
                  className="flex-1 text-[11.5px] px-2 py-1 bg-white border border-emerald-400 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 font-semibold text-slate-900"
                />
                <button
                  type="button"
                  onMouseDown={e => {
                    e.preventDefault()
                    if (excelCustomMaterial.trim()) {
                      commitMaterialSelect(targetIdx, excelCustomMaterial.trim())
                      setExcelCustomMaterial('')
                    }
                  }}
                  className="w-6 h-6 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center transition-colors shadow-2xs cursor-pointer shrink-0"
                  title="Save Custom Material"
                >
                  <Check size={12} className="stroke-[3]" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )
    }

    // 3. Start Time & End Time with typing and clear AM / PM suggestions (No datalist clash, no blur flicker)
    if (col.id === 'start_time' || col.id === 'end_time') {
      return (
        <div className="relative w-full h-full">
          <input
            ref={inputRef}
            type="text"
            value={editingCell.tempValue}
            onChange={e => setEditingCell({ ...editingCell, tempValue: e.target.value })}
            onKeyDown={handleEditorKeyDown}
            placeholder="e.g. 10:00 AM"
            className={`w-full h-full text-[12px] font-mono border-0 outline-none p-0 focus:ring-0 ${isLightBg ? 'bg-white text-slate-900' : 'bg-slate-900 text-white'}`}
          />
          <div
            onMouseDown={e => {
              e.preventDefault()
              e.stopPropagation()
            }}
            className={`absolute z-[100] left-0 ${
              isNearBottom ? 'bottom-full mb-1' : 'top-full mt-1'
            } w-36 max-h-48 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl p-1 text-slate-800 text-[11.5px] animate-in fade-in select-none`}
          >
            <div className="px-2 py-0.5 text-[9.5px] font-black uppercase text-slate-400">AM / PM Times</div>
            <div className="space-y-0.5">
              {TIME_SUGGESTIONS.map(timeStr => (
                <div
                  key={timeStr}
                  onMouseDown={() => {
                    const updated = [...gridRows]
                    const r = { ...updated[targetIdx] }
                    ;(r as any)[col.id] = timeStr
                    if (r.start_time && r.end_time && r.start_time !== '—' && r.end_time !== '—') {
                      r.duty_hours = Math.round(calcHours(r.start_time, r.end_time) * 10) / 10
                      r.ot_hours = Math.round(calcOTHours(r.start_time, r.end_time) * 10) / 10
                    }
                    updated[targetIdx] = r
                    pushState(updated)
                    setEditingCell(null)
                  }}
                  className="px-2 py-1 rounded hover:bg-emerald-50 hover:text-emerald-900 transition-colors cursor-pointer font-mono font-semibold"
                >
                  {timeStr}
                </div>
              ))}
            </div>
          </div>
        </div>
      )
    }

    // 4. Default Select or Input
    if (col.type === 'select' && col.options) {
      return (
        <select
          ref={inputRef as any}
          value={editingCell.tempValue}
          onChange={e => setEditingCell({ ...editingCell, tempValue: e.target.value })}
          onBlur={commitCellEdit}
          onKeyDown={handleEditorKeyDown}
          className={`w-full h-full text-[12px] font-mono border-0 outline-none p-0 ${isLightBg ? 'bg-white text-slate-900' : 'bg-slate-900 text-white'}`}
        >
          {col.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      )
    }

    return (
      <input
        ref={inputRef}
        type={col.type === 'date' ? 'date' : 'text'}
        list={AUTOCOMPLETE_LIST[col.id as string]}
        value={editingCell.tempValue}
        onChange={e => setEditingCell({ ...editingCell, tempValue: e.target.value })}
        onBlur={commitCellEdit}
        onKeyDown={handleEditorKeyDown}
        className={`w-full h-full text-[12px] font-mono border-0 outline-none p-0 focus:ring-0 ${isLightBg ? 'bg-white text-slate-900' : 'bg-slate-900 text-white'}`}
      />
    )
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

  // ── Open & Save Row Edit Modal ──
  const handleOpenEditModal = (row: DailyJob, index: number) => {
    setEditingRowState({ row: { ...row }, index })
  }

  const handleSaveEditedRow = (updatedRow: DailyJob, index: number) => {
    const updated = [...gridRows]
    updated[index] = updatedRow
    pushState(updated)
    setEditingRowState(null)
    showToast(`✓ Row #${index + 1} updated successfully`)
  }

  // ── Insert Row Above or Below (Used by Right-Click Menu & Add Row - Guaranteed completely empty) ──
  const insertRowAt = (targetIdx: number, position: 'above' | 'below', _defaultStaff?: string) => {
    const newJob: DailyJob = {
      id: newRowId('new'),
      date: effectiveTargetDate,
      staff_name: '',
      start_time: '',
      end_time: '',
      duty_hours: 0,
      ot_hours: 0,
      address: '',
      area: '',
      charges: 0,
      received: 0,
      payment_mode: '' as any,
      is_overtime: false,
      material: '' as any,
      remarks: '',
      created_at: new Date().toISOString()
    }

    const insertIdx = position === 'above' ? Math.max(0, targetIdx) : targetIdx + 1
    const updated = [...gridRows]
    updated.splice(insertIdx, 0, newJob)
    pushState(updated)
    setActiveCell({ rowIdx: insertIdx, colId: 'staff_name' })
    setContextMenu(null)
    showToast(`✓ Empty row added ${position === 'above' ? 'at top (above)' : 'at bottom (below)'}`)
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

  // ── Add Row to specific Staff Block (Expands block from 3 to 4, 5, etc.) ──
  const handleAddRowToStaff = (staffName: string, insertAfterIndex: number) => {
    const newJob: DailyJob = {
      id: newRowId('new_shift'),
      date: effectiveTargetDate,
      staff_name: staffName,
      start_time: '',
      end_time: '',
      duty_hours: 0,
      ot_hours: 0,
      address: '',
      area: '',
      material: '' as any,
      charges: 0,
      received: 0,
      payment_mode: '' as any,
      remarks: '',
      is_overtime: false,
      created_at: new Date().toISOString()
    }
    const updated = [...gridRows]
    const insertPos = insertAfterIndex >= 0 ? insertAfterIndex + 1 : updated.length
    updated.splice(insertPos, 0, newJob)
    pushState(updated)
    showToast(`✓ Row added to expand ${staffName || 'Staff'}'s block`)
  }

  // ── Helper: Strictly generates 3 blank rows for a new cleaner block ──
  const createThreeBlankRows = (mode?: string) => {
    const blockTs = Date.now()
    const targetMode = mode !== undefined ? mode : (paymentModeFilter !== 'ALL' ? paymentModeFilter : '')
    const isProject = targetMode === 'Project'
    let assignedPaymentMode: PaymentMode | '' = ''
    if (targetMode === 'Monthly') assignedPaymentMode = 'Monthly'
    else if (targetMode === 'Cash') assignedPaymentMode = 'Cash'
    else if (targetMode === 'Online') assignedPaymentMode = 'Online'
    else if (targetMode === 'Pending') assignedPaymentMode = 'Pending'
    else if (isProject) assignedPaymentMode = 'Cash'

    return [0, 1, 2].map((idx) => ({
      id: newRowId(`blank_cleaner_${blockTs}_${idx}`),
      date: effectiveTargetDate,
      staff_name: '',
      start_time: '',
      end_time: '',
      duty_hours: 0,
      ot_hours: 0,
      address: '',
      area: '',
      material: '' as any,
      charges: 0,
      received: 0,
      payment_mode: assignedPaymentMode as any,
      team_name: isProject ? 'Project Team' : undefined,
      remarks: '',
      is_overtime: false,
      created_at: new Date(blockTs + idx * 10).toISOString()
    }))
  }

  // ── Add New Empty Block Above Selected Staff Block ──
  const handleAddEmptyBlockAbove = (targetJob: DailyJob, rowIdx: number) => {
    const bInfo = staffBlockInfoMap.get(targetJob.id)
    const blockStartIndex = Math.max(0, rowIdx - (bInfo?.blockRowIdx ?? 0))
    const newBlock = createThreeBlankRows(targetJob.payment_mode || undefined)
    const updated = [...gridRows]
    updated.splice(blockStartIndex, 0, ...newBlock)
    pushState(updated)
    showToast('✓ Added new empty block (3 rows) above')
  }

  // ── Add New Empty Block Below Selected Staff Block ──
  const handleAddEmptyBlockBelow = (targetJob: DailyJob, rowIdx: number) => {
    const bInfo = staffBlockInfoMap.get(targetJob.id)
    const blockStartIndex = Math.max(0, rowIdx - (bInfo?.blockRowIdx ?? 0))
    const blockRowCount = bInfo?.rowCount ?? 3
    const insertAt = blockStartIndex + blockRowCount
    const newBlock = createThreeBlankRows(targetJob.payment_mode || undefined)
    const updated = [...gridRows]
    updated.splice(insertAt, 0, ...newBlock)
    pushState(updated)
    showToast('✓ Added new empty block (3 rows) below')
  }

  // ── Add New Empty Row (Strictly adds a brand new cleaner block of exactly 3 rows) ──
  const handleAddBlankCleanerBlock = () => {
    const newJobs = createThreeBlankRows()
    const updated = [...gridRows, ...newJobs]
    pushState(updated)
    const label = paymentModeFilter !== 'ALL' ? ` (${paymentModeFilter} View)` : ''
    showToast(`✓ 3 new empty rows added${label}`)
  }

  // ── Delete Entire Staff Block (Removes all rows for this cleaner block) ──
  const handleDeleteStaffBlock = (target: DailyJob | string) => {
    const targetJob = typeof target === 'string' ? null : target
    const rawName = (typeof target === 'string' ? target : (target?.staff_name || '')).trim()
    let updated: DailyJob[]

    if (rawName) {
      const staffKey = rawName.toLowerCase()
      updated = gridRows.filter(r => (r.staff_name || '').trim().toLowerCase() !== staffKey)
      showToast(`✓ Staff block for "${rawName}" deleted`)
    } else if (targetJob) {
      const targetIdx = gridRows.findIndex(r => r.id === targetJob.id)
      if (targetIdx >= 0) {
        const bInfo = staffBlockInfoMap.get(targetJob.id)
        const bStart = targetIdx - (bInfo?.blockRowIdx ?? 0)
        const bCount = bInfo?.rowCount ?? 3
        updated = gridRows.filter((_, i) => i < bStart || i >= bStart + bCount)
      } else {
        updated = gridRows.filter(r => r.id !== targetJob.id)
      }
      showToast('✓ Blank staff block (3 rows) deleted')
    } else {
      updated = gridRows
    }

    pushState(updated.length > 0 ? updated : ensureThreeRowsPerStaff([], effectiveTargetDate))
    setActiveCell(null)
    setContextMenu(null)
  }

  // Delete Selected Row (Preserves 3 fixed rows per cleaner)
  const handleDeleteRow = (idx: number) => {
    const target = gridRows[idx]
    if (!target) return
    const staffKey = (target.staff_name || '').trim().toLowerCase()
    const staffRows = gridRows.filter(r => (r.staff_name || '').trim().toLowerCase() === staffKey)

    if (staffRows.length > 3) {
      // If cleaner has more than 3 rows, remove this extra row to shrink block
      const updated = gridRows.filter((_, i) => i !== idx)
      pushState(updated)
      if (activeCell?.rowIdx === idx) setActiveCell(null)
      showToast(`✓ Extra row removed from ${target.staff_name || 'Staff'}`)
    } else {
      // If cleaner has 3 rows or fewer, clear this row's contents
      const updated = [...gridRows]
      updated[idx] = {
        ...target,
        start_time: '',
        end_time: '',
        duty_hours: 0,
        ot_hours: 0,
        address: '',
        area: '',
        material: 'No',
        charges: 0,
        received: 0,
        payment_mode: 'Cash',
        remarks: ''
      }
      pushState(updated)
      showToast(`✓ Shift row cleared (maintains 3 fixed rows for ${target.staff_name || 'cleaner'})`)
    }
    setContextMenu(null)
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

  // ── Change Staff Block Color (Block-isolated: applies row_color directly across all rows of that block) ──
  const setBlockColor = (targetJob: DailyJob, rowIdx: number, paletteKey: string) => {
    const bInfo = staffBlockInfoMap.get(targetJob.id)
    const blockStartIndex = Math.max(0, rowIdx - (bInfo?.blockRowIdx ?? 0))
    const blockRowCount = bInfo?.rowCount ?? 3

    const updated = [...gridRows]
    for (let i = 0; i < blockRowCount; i++) {
      const idx = blockStartIndex + i
      if (updated[idx]) {
        updated[idx] = { ...updated[idx], row_color: paletteKey }
      }
    }
    pushState(updated)
    setColorPickerCleaner(null)
    setContextMenu(null)

    const staffLabel = targetJob.staff_name?.trim() || 'Staff Block'
    showToast(`✓ Block color for "${staffLabel}" set to ${BLOCK_PALETTES[paletteKey]?.name || paletteKey}`)
  }

  // ── Reset Block Color (Block-isolated: clears row_color on all rows of that block) ──
  const resetBlockColor = (targetJob: DailyJob, rowIdx: number) => {
    const bInfo = staffBlockInfoMap.get(targetJob.id)
    const blockStartIndex = Math.max(0, rowIdx - (bInfo?.blockRowIdx ?? 0))
    const blockRowCount = bInfo?.rowCount ?? 3

    const updated = [...gridRows]
    for (let i = 0; i < blockRowCount; i++) {
      const idx = blockStartIndex + i
      if (updated[idx]) {
        const next = { ...updated[idx] }
        delete next.row_color
        updated[idx] = next
      }
    }
    if (targetJob.staff_name?.trim()) {
      const key = targetJob.staff_name.trim().toLowerCase()
      if (cleanerColors[key]) {
        const nextColors = { ...cleanerColors }
        delete nextColors[key]
        setCleanerColors(nextColors)
        safeSet('safaeewala_excel_cleaner_colors', nextColors)
      }
    }
    pushState(updated)
    setContextMenu(null)
    showToast(`Default color restored for ${targetJob.staff_name?.trim() || 'Staff Block'}`)
  }

  // ── Set Single Row Color (Granular: Only this specific single row, NOT the whole block) ──
  const handleSetSingleRowColor = (rowIdx: number, paletteKey: string) => {
    const updated = [...gridRows]
    if (updated[rowIdx]) {
      updated[rowIdx] = { ...updated[rowIdx], row_color: paletteKey }
      pushState(updated)
    }
    setContextMenu(null)
    showToast(`✓ Color applied to Row #${rowIdx + 1} (${BLOCK_PALETTES[paletteKey]?.name || paletteKey})`)
  }

  const handleResetSingleRowColor = (rowIdx: number) => {
    const updated = [...gridRows]
    if (updated[rowIdx]) {
      const next = { ...updated[rowIdx] }
      delete next.row_color
      updated[rowIdx] = next
      pushState(updated)
    }
    setContextMenu(null)
    showToast(`✓ Reset color on Row #${rowIdx + 1}`)
  }

  // ── Set Single Cell Color (Granular: Only this specific cell, NOT the row or block) ──
  const handleSetCellColor = (rowId: string, colId: string, paletteKey: string) => {
    const cellKey = `${rowId}_${colId}`
    setCellColors(prev => {
      const next = { ...prev, [cellKey]: paletteKey }
      safeSet('safaeewala_excel_cell_colors', next)
      return next
    })
    setContextMenu(null)
    const colDef = columns.find(c => c.id === colId)
    showToast(`✓ Color applied to this cell only (${colDef?.label || colId})`)
  }

  const handleResetCellColor = (rowId: string, colId: string) => {
    const cellKey = `${rowId}_${colId}`
    setCellColors(prev => {
      const next = { ...prev }
      delete next[cellKey]
      safeSet('safaeewala_excel_cell_colors', next)
      return next
    })
    setContextMenu(null)
    showToast(`✓ Reset color on this cell`)
  }

  // ── Column Header Context Menu (Click / Right-click on column header after Staff changes whole row color) ──
  const handleColumnHeaderContextMenu = (e: React.MouseEvent, colId: string) => {
    e.preventDefault()
    e.stopPropagation()
    const targetIdx = activeCell ? activeCell.rowIdx : 0
    const targetJob = gridRows[targetIdx] || gridRows[0]
    if (!targetJob) return

    if (colId === 'staff_name') {
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        rowIdx: targetIdx,
        job: targetJob,
        colId: 'staff_name',
      })
    } else {
      // Rule: Clicking / right-clicking on column header after Staff applies color to the WHOLE ROW
      setColorTargetScope('row')
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        rowIdx: targetIdx,
        job: targetJob,
        colId,
      })
    }
  }

  // ── Date Preset Selection Handler ──
  const handleSelectDatePreset = (presetKey: ExcelDatePresetKey) => {
    setActiveDatePreset(presetKey)
    setShowDatePresetDropdown(false)

    const today = todayDubai()
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth()

    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

    if (presetKey === 'all') {
      setDateFilterMode('all')
      setRangeStart('')
      setRangeEnd('')
      showToast('Viewing All Records')
      return
    }

    setDateFilterMode('range')

    if (presetKey === 'today') {
      setRangeStart(today)
      setRangeEnd(today)
      setSelectedDate(today)
      setSearchParams({ date: today }, { replace: true })
      showToast('Date set to Today')
    } else if (presetKey === 'yesterday') {
      const yest = addDaysToYMD(today, -1)
      setRangeStart(yest)
      setRangeEnd(yest)
      setSelectedDate(yest)
      setSearchParams({ date: yest }, { replace: true })
      showToast('Date set to Yesterday')
    } else if (presetKey === 'last_month') {
      const start = iso(new Date(y, m - 1, 1))
      const end = iso(new Date(y, m, 0))
      setRangeStart(start)
      setRangeEnd(end)
      showToast('Date range set to Last Month')
    } else if (presetKey === 'last_3_months') {
      const start = iso(new Date(y, m - 2, 1))
      setRangeStart(start)
      setRangeEnd(today)
      showToast('Date range set to Last 3 Months')
    } else if (presetKey === 'last_6_months') {
      const start = iso(new Date(y, m - 5, 1))
      setRangeStart(start)
      setRangeEnd(today)
      showToast('Date range set to Last 6 Months')
    } else if (presetKey === 'last_year') {
      const start = iso(new Date(y - 1, m, now.getDate()))
      setRangeStart(start)
      setRangeEnd(today)
      showToast('Date range set to Last Year')
    } else if (presetKey === 'two_years') {
      const start = iso(new Date(y - 2, m, now.getDate()))
      setRangeStart(start)
      setRangeEnd(today)
      showToast('Date range set to 2 Years')
    } else if (presetKey === 'custom') {
      if (!rangeStart) setRangeStart(today)
      if (!rangeEnd) setRangeEnd(today)
      showToast('Custom Range selected')
    }
  }

  // ── Set Column Color (Granular: Only this specific column across the sheet) ──
  const handleSetColumnColor = (colId: string, paletteKey: string) => {
    setColumnColors(prev => {
      const next = { ...prev, [colId]: paletteKey }
      safeSet('safaeewala_excel_column_colors', next)
      return next
    })
    setContextMenu(null)
    const colDef = columns.find(c => c.id === colId)
    showToast(`✓ Color applied to Column "${colDef?.label || colId}" (${BLOCK_PALETTES[paletteKey]?.name || paletteKey})`)
  }

  const handleResetColumnColor = (colId: string) => {
    setColumnColors(prev => {
      const next = { ...prev }
      delete next[colId]
      safeSet('safaeewala_excel_column_colors', next)
      return next
    })
    setContextMenu(null)
    const colDef = columns.find(c => c.id === colId)
    showToast(`✓ Reset color on Column "${colDef?.label || colId}"`)
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
  const getCleanerPalette = (cleanerName: string, idx: number, rowColor?: string): BlockPalette => {
    if (rowColor) {
      if (BLOCK_PALETTES[rowColor]) return BLOCK_PALETTES[rowColor]
      if (rowColor.startsWith('#')) return makeHexPalette(rowColor)
    }
    const key = (cleanerName || '').trim().toLowerCase()
    const customKey = cleanerColors[key]
    if (customKey) {
      if (BLOCK_PALETTES[customKey]) return BLOCK_PALETTES[customKey]
      if (customKey.startsWith('#')) return makeHexPalette(customKey)
    }
    // Default deterministic assignment: Flat Grid Mode defaults to light colors
    const keyPool = viewMode === 'flat' ? LIGHT_PALETTE_KEYS : PALETTE_KEYS
    const paletteKey = keyPool[idx % keyPool.length]
    return BLOCK_PALETTES[paletteKey] || BLOCK_PALETTES.emerald
  }

  // Right-Click Context Menu Trigger (Carries specific colId for granular customization)
  const handleContextMenu = (e: React.MouseEvent, rowIdx: number, job: DailyJob, colId: string = 'staff_name') => {
    e.preventDefault()
    e.stopPropagation()
    const clickX = e.clientX
    const clickY = e.clientY
    // Keep context menu on screen with taller height for 20 solid colors options panel
    const menuWidth = 330
    const menuHeight = 540
    const posX = clickX + menuWidth > window.innerWidth ? Math.max(10, window.innerWidth - menuWidth - 15) : clickX
    const posY = clickY + menuHeight > window.innerHeight ? Math.max(10, window.innerHeight - menuHeight - 15) : clickY

    setActiveCell({ rowIdx, colId })
    setColorTargetScope(colId === 'staff_name' ? 'row' : 'cell')
    setContextMenu({
      x: posX,
      y: posY,
      rowIdx,
      job,
      colId,
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

    const payload = (row: DailyJob) => {
      const mcInfo = getMultiCleanerPaymentInfo(row, gridRows)
      const isSec = Boolean(mcInfo?.isSecondary)
      return {
        date: row.date || selectedDate,
        staff_name: row.staff_name,
        team_name: row.team_name || mcInfo?.teamRef || '',
        start_time: row.start_time,
        end_time: row.end_time,
        duty_hours: cleanNum(row.duty_hours),
        ot_hours: cleanNum(row.ot_hours),
        address: row.address,
        area: row.area,
        charges: isSec ? 0 : cleanNum(row.charges),
        received: isSec ? 0 : cleanNum(row.received),
        payment_mode: isSec ? ('Above' as any) : row.payment_mode,
        is_overtime: cleanNum(row.ot_hours) > 0,
        material: row.material,
        service: row.service,
        remarks: row.remarks,
      }
    }

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
      const mcInfo = getMultiCleanerPaymentInfo(r, gridRows)
      columns.forEach(col => {
        let val: any = r[col.id as keyof DailyJob]
        if (col.id === 'team_name') {
          if (mcInfo?.isSecondary) val = mcInfo.teamRef
          else if (mcInfo?.isPrimary && mcInfo.isMultiCleaner) val = `${mcInfo.teamRef} (Lead)`
          else val = r.team_name || ''
        } else if (col.id === 'charges') {
          val = mcInfo?.isSecondary ? `Added ${mcInfo.teamRef || 'Team'}` : r.charges
        } else if (col.id === 'received') {
          val = mcInfo?.isSecondary ? `Reference ${mcInfo.primaryCleaner || 'Lead'}` : r.received
        } else if (col.id === 'pending') {
          val = mcInfo?.isSecondary ? 'Nil' : rowPending(r)
        } else if (col.id === 'payment_mode') {
          val = mcInfo?.isSecondary ? 'Above' : r.payment_mode
        }
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
      const mcInfo = getMultiCleanerPaymentInfo(r, gridRows)
      columns.forEach(col => {
        let val: any = r[col.id as keyof DailyJob]
        if (col.id === 'team_name') {
          if (mcInfo?.isSecondary) val = mcInfo.teamRef
          else if (mcInfo?.isPrimary && mcInfo.isMultiCleaner) val = `${mcInfo.teamRef} (Lead)`
          else val = r.team_name || ''
        } else if (col.id === 'charges') {
          val = mcInfo?.isSecondary ? `Added ${mcInfo.teamRef || 'Team'}` : r.charges
        } else if (col.id === 'received') {
          val = mcInfo?.isSecondary ? `Reference ${mcInfo.primaryCleaner || 'Lead'}` : r.received
        } else if (col.id === 'pending') {
          val = mcInfo?.isSecondary ? 'Nil' : rowPending(r)
        } else if (col.id === 'payment_mode') {
          val = mcInfo?.isSecondary ? 'Above' : r.payment_mode
        }
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

  // Filter Counts for Header Quick Filter Tabs
  const filterCounts = useMemo(() => {
    let monthly = 0, cash = 0, online = 0, pending = 0, project = 0
    for (const r of gridRows) {
      if (r.payment_mode === 'Monthly') monthly++
      else if (r.payment_mode === 'Cash') cash++
      else if (r.payment_mode === 'Online') online++
      if (r.payment_mode === 'Pending' || rowPending(r) > 0) pending++

      const mc = getMultiCleanerPaymentInfo(r, gridRows)
      if (r.team_name || mc?.isMultiCleaner || mc?.teamRef) project++
    }
    return { all: gridRows.length, monthly, cash, online, pending, project }
  }, [gridRows, pendingCtx])

  // Filtered rows for search and payment mode tabs
  const [renderLimit, setRenderLimit] = useState(RENDER_PAGE)
  const filteredGridRows = useMemo(() => {
    let list = gridRows
    const isBlankRow = (r: DailyJob) => !String(r.staff_name || '').trim() && !String(r.address || '').trim()

    if (paymentModeFilter === 'Monthly') {
      list = list.filter(r => r.payment_mode === 'Monthly' || (isBlankRow(r) && !r.payment_mode))
    } else if (paymentModeFilter === 'Cash') {
      list = list.filter(r => r.payment_mode === 'Cash' || (isBlankRow(r) && !r.payment_mode))
    } else if (paymentModeFilter === 'Online') {
      list = list.filter(r => r.payment_mode === 'Online' || (isBlankRow(r) && !r.payment_mode))
    } else if (paymentModeFilter === 'Pending') {
      list = list.filter(r => r.payment_mode === 'Pending' || rowPending(r) > 0 || (isBlankRow(r) && !r.payment_mode))
    } else if (paymentModeFilter === 'Project') {
      // Filter only jobs that belong to a project / team, or blank rows created in Project view
      const projectRows = list.filter(r => {
        const mc = getMultiCleanerPaymentInfo(r, gridRows)
        return Boolean(r.team_name || mc?.isMultiCleaner || mc?.teamRef || (isBlankRow(r) && r.team_name))
      })

      // Group team-wise: Leader on top, other team members listed directly below
      const teamMap = new Map<string, { leaders: DailyJob[]; members: DailyJob[] }>()
      projectRows.forEach(r => {
        const mc = getMultiCleanerPaymentInfo(r, gridRows)
        const teamKey = (mc?.teamRef || r.team_name || 'Project Team').trim()
        if (!teamMap.has(teamKey)) {
          teamMap.set(teamKey, { leaders: [], members: [] })
        }
        const group = teamMap.get(teamKey)!
        if (mc?.isPrimary) {
          group.leaders.push(r)
        } else {
          group.members.push(r)
        }
      })

      const organized: DailyJob[] = []
      teamMap.forEach(group => {
        // Leader top par
        if (group.leaders.length > 0) {
          organized.push(...group.leaders)
        }
        // Baki team members uskay neeche
        organized.push(...group.members)
      })
      list = organized
    }
    if (!filterSearch.trim()) return list
    const q = filterSearch.toLowerCase()
    return list.filter(r =>
      (r.staff_name || '').toLowerCase().includes(q) ||
      (r.address || '').toLowerCase().includes(q) ||
      (r.area || '').toLowerCase().includes(q) ||
      (r.payment_mode || '').toLowerCase().includes(q) ||
      (r.remarks || '').toLowerCase().includes(q)
    )
  }, [gridRows, paymentModeFilter, filterSearch, pendingCtx])
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

  // ── Pre-calculate Staff Block Info (3 fixed rows, rowSpan & boundaries) ──
  const staffBlockInfoMap = useMemo(() => {
    const map = new Map<string, {
      isFirst: boolean
      isLast: boolean
      rowCount: number
      blockRowIdx: number
      staffName: string
      lastRowIdx: number
    }>()

    let currentStaffKey: string | null = null
    let blockRows: { row: DailyJob; globalIdx: number }[] = []

    const flush = () => {
      if (blockRows.length === 0) return
      const count = blockRows.length
      const lastIdx = blockRows[blockRows.length - 1].globalIdx
      const staffName = blockRows[0].row.staff_name || ''
      blockRows.forEach((item, bIdx) => {
        map.set(item.row.id, {
          isFirst: bIdx === 0,
          isLast: bIdx === count - 1,
          rowCount: count,
          blockRowIdx: bIdx,
          staffName,
          lastRowIdx: lastIdx
        })
      })
    }

    visibleGridRows.forEach((row) => {
      const gIdx = gridRows.findIndex(r => r.id === row.id)
      const rawStaff = (row.staff_name || '').trim()
      const isBlankStaff = !rawStaff
      const staffKey = isBlankStaff ? 'unassigned_cleaner' : rawStaff.toLowerCase()

      // When cleaner is unassigned/blank, strictly group every 3 rows as an independent block
      if (staffKey !== currentStaffKey || (isBlankStaff && blockRows.length >= 3)) {
        flush()
        currentStaffKey = staffKey
        blockRows = [{ row, globalIdx: gIdx >= 0 ? gIdx : 0 }]
      } else {
        blockRows.push({ row, globalIdx: gIdx >= 0 ? gIdx : 0 })
      }
    })
    flush()

    return map
  }, [visibleGridRows, gridRows])

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
        const palette = getCleanerPalette(rawName, staffIdx++, row.row_color)
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

      {/* ── Professional Executive Gradient Header (Sleek Slate & Deep Emerald Luxury) ── */}
      <header className="bg-gradient-to-r from-slate-950 via-[#072d1f] to-slate-950 border-b border-emerald-500/30 text-white px-5 sm:px-6 py-5 min-h-[86px] flex items-center justify-between shadow-xl shrink-0 relative z-30">
        {/* Sophisticated Glow effect matching executive dashboard */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute right-10 -top-10 w-96 h-96 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute left-1/3 -top-20 w-80 h-80 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
        </div>

        <div className="relative z-10 flex items-center gap-3">
          {/* Back Icon Button (Text removed as requested) */}
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
            className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer border border-white/15 shadow-xs"
            title="Back to Daily Job Sheet (or close tab)"
          >
            <ArrowLeft size={18} />
          </button>

          <div className="h-6 w-px bg-white/20" />

          {/* Title & Badge */}
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white text-emerald-800 flex items-center justify-center font-black text-sm shadow-sm">
              <FileSpreadsheet size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-[16px] tracking-tight">Excel Job Sheet</span>
                {hasUnsavedChanges && (
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-400 text-amber-950 animate-pulse">
                    ● {pendingChanges.count} unsaved change{pendingChanges.count === 1 ? '' : 's'}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic Date Filters & Action Controls */}
        <div className="relative z-10 flex items-center gap-2.5 flex-wrap">
          {/* Quick Undo & Redo buttons */}
          <div className="flex items-center bg-black/20 rounded-xl p-0.5 border border-white/20">
            <button
              onClick={handleUndo}
              disabled={history.length === 0}
              className={`p-1.5 rounded-lg transition-colors ${history.length > 0 ? 'text-white hover:bg-white/20 cursor-pointer' : 'text-white/40 cursor-not-allowed'}`}
              title="Undo (Ctrl+Z)"
            >
              <Undo2 size={15} />
            </button>
            <button
              onClick={handleRedo}
              disabled={future.length === 0}
              className={`p-1.5 rounded-lg transition-colors ${future.length > 0 ? 'text-white hover:bg-white/20 cursor-pointer' : 'text-white/40 cursor-not-allowed'}`}
              title="Redo (Ctrl+Y)"
            >
              <Redo2 size={15} />
            </button>
          </div>

          {/* ── Date Range Function Display (Default) & Preset Dropdown Menu ── */}
          <div className="relative flex items-center gap-1.5 bg-black/25 rounded-xl p-1 border border-white/20 text-white text-[11px]" ref={datePresetRef}>
            {/* Inline Date Range Picker: From Date to To Date */}
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-black/20 rounded-lg">
              <Calendar size={13} className="text-white/70 shrink-0" />
              {dateFilterMode === 'all' ? (
                <span className="font-extrabold text-[11.5px] text-white px-2 py-0.5">All Dates</span>
              ) : (
                <div className="flex items-center gap-1.5">
                  <input
                    type="date"
                    value={rangeStart || selectedDate}
                    onChange={e => {
                      setRangeStart(e.target.value)
                      setDateFilterMode('range')
                      setActiveDatePreset('custom')
                    }}
                    className="bg-transparent px-1 py-0.5 font-bold focus:outline-none cursor-pointer [color-scheme:dark] text-[11.5px]"
                    title="From Date"
                  />
                  <span className="text-white/60 font-medium text-[10.5px]">to</span>
                  <input
                    type="date"
                    value={rangeEnd || selectedDate}
                    onChange={e => {
                      setRangeEnd(e.target.value)
                      setDateFilterMode('range')
                      setActiveDatePreset('custom')
                    }}
                    className="bg-transparent px-1 py-0.5 font-bold focus:outline-none cursor-pointer [color-scheme:dark] text-[11.5px]"
                    title="To Date"
                  />
                </div>
              )}
            </div>

            {/* Dropdown Menu Trigger Button */}
            <button
              type="button"
              onClick={() => setShowDatePresetDropdown(prev => !prev)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-white font-extrabold text-[11px] transition-all cursor-pointer border border-white/15 shadow-2xs"
              title="Select Date Range Preset"
            >
              <span>
                {EXCEL_DATE_PRESETS.find(p => p.id === activeDatePreset)?.label || 'Date Range'}
              </span>
              <ChevronDown size={12} className={`transition-transform duration-200 ${showDatePresetDropdown ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown Menu Popover */}
            {showDatePresetDropdown && (
              <div className="absolute left-0 top-full mt-2 z-50 w-56 bg-white rounded-xl shadow-2xl border border-slate-200 p-1.5 text-slate-800 text-[12px] animate-in fade-in zoom-in-95 select-none font-sans">
                <div className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100 mb-1">
                  Date Range Presets
                </div>
                <div className="space-y-0.5 max-h-72 overflow-y-auto">
                  {EXCEL_DATE_PRESETS.map(preset => {
                    const isSelected = activeDatePreset === preset.id
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleSelectDatePreset(preset.id)}
                        className={`w-full px-2.5 py-1.5 rounded-lg text-left flex items-center justify-between font-medium transition-colors cursor-pointer ${
                          isSelected ? 'bg-emerald-50 text-emerald-950 font-bold' : 'hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <div>
                          <div className="text-[12px]">{preset.label}</div>
                          {preset.desc && <div className="text-[10px] text-slate-400 font-normal">{preset.desc}</div>}
                        </div>
                        {isSelected && <Check size={14} className="text-emerald-700 stroke-[3] shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>



          {/* ── Dedicated Add Job Button ── */}
          <button
            type="button"
            onClick={() => setShowAddJobModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white font-black text-[12px] border border-white/30 shadow-xs transition-all cursor-pointer active:scale-95"
            title="Add a new job entry for this date"
          >
            <Plus size={14} className="stroke-[3]" />
            <span>Add Job</span>
          </button>

          {/* ── Save All Button ── */}
          <button
            type="button"
            onClick={handleSaveAll}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-black text-[12.5px] transition-all cursor-pointer shadow-sm ${
              hasUnsavedChanges
                ? 'bg-amber-400 hover:bg-amber-300 text-amber-950 shadow-amber-900/40 ring-2 ring-white/90 animate-pulse'
                : 'bg-white text-emerald-950 hover:bg-emerald-50 border border-white/80'
            }`}
            title="Save and synchronize back to main Daily Job Sheet (Ctrl+S)"
          >
            <Save size={14} className={hasUnsavedChanges ? 'text-amber-950' : 'text-emerald-800'} />
            <span>{hasUnsavedChanges ? `Save ${pendingChanges.count} change${pendingChanges.count === 1 ? '' : 's'}` : 'Saved'}</span>
          </button>

          {/* ── Three-Dot Menu (Sync, Backup, File, Audit History & Tools) ── */}
          <div className="relative" ref={threeDotRef}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setShowThreeDotMenu(!showThreeDotMenu)
              }}
              className="p-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white font-bold text-[12px] border border-white/25 transition-all cursor-pointer shadow-xs"
              title="More Options"
            >
              <MoreVertical size={16} />
            </button>

            {showThreeDotMenu && (
              <div
                onClick={e => e.stopPropagation()}
                className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-slate-200 py-2 z-50 text-slate-800 text-[12px] max-h-[82vh] overflow-y-auto divide-y divide-slate-100 animate-in fade-in zoom-in-95"
              >
                {/* Section 1: Sync & Cloud */}
                <div className="py-1">
                  <div className="px-3.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400">Sync & Cloud</div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowThreeDotMenu(false)
                      setShowMonthlySyncModal(true)
                    }}
                    className="w-full px-3.5 py-2 hover:bg-slate-50 flex items-center justify-between gap-2 text-left cursor-pointer transition-colors"
                  >
                    <span className="flex items-center gap-2.5 font-semibold text-slate-700">
                      <Sparkles size={14} className="text-amber-600" />
                      <span>Monthly Sync</span>
                    </span>
                    {monthlySyncStatus.pendingSyncCount > 0 ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                        {monthlySyncStatus.pendingSyncCount} pending
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400 font-semibold">
                        {monthlySyncStatus.totalScheduled} synced
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowThreeDotMenu(false)
                      handleBackupToDrive()
                    }}
                    disabled={isBackingUp}
                    className="w-full px-3.5 py-2 hover:bg-slate-50 flex items-center gap-2.5 text-left cursor-pointer transition-colors disabled:opacity-50 text-slate-700"
                  >
                    <CloudUpload size={14} className="text-emerald-600" />
                    <span className="font-semibold">{isBackingUp ? 'Backing up…' : 'Save to Google Drive'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowThreeDotMenu(false)
                      setShowDriveModal(true)
                    }}
                    className="w-full px-3.5 py-2 hover:bg-slate-50 flex items-center gap-2.5 text-left cursor-pointer transition-colors text-slate-600"
                  >
                    <SlidersHorizontal size={13} className="text-slate-400" />
                    <span>Drive Webhook Settings</span>
                  </button>
                </div>

                {/* Section 2: File & Export */}
                <div className="py-1">
                  <div className="px-3.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400">File & Export</div>
                  <button
                    onClick={() => { handleSaveAll(); setShowThreeDotMenu(false) }}
                    className="w-full px-3.5 py-2 text-left hover:bg-slate-50 flex items-center justify-between font-medium text-slate-700 cursor-pointer"
                  >
                    <span className="flex items-center gap-2.5"><Save size={14} className="text-emerald-700" /> Save to CRM</span>
                    <kbd className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-400 font-mono">Ctrl+S</kbd>
                  </button>
                  <button
                    onClick={() => { handleExportXLSX(); setShowThreeDotMenu(false) }}
                    className="w-full px-3.5 py-2 text-left hover:bg-slate-50 flex items-center gap-2.5 font-medium text-slate-700 cursor-pointer"
                  >
                    <Download size={14} className="text-emerald-700" /> Export Excel (.xlsx)
                  </button>
                  <button
                    onClick={() => { handleExportCSV(); setShowThreeDotMenu(false) }}
                    className="w-full px-3.5 py-2 text-left hover:bg-slate-50 flex items-center gap-2.5 font-medium text-slate-700 cursor-pointer"
                  >
                    <Download size={14} className="text-blue-600" /> Export CSV (.csv)
                  </button>
                  <button
                    onClick={() => { window.print(); setShowThreeDotMenu(false) }}
                    className="w-full px-3.5 py-2 text-left hover:bg-slate-50 flex items-center justify-between font-medium text-slate-700 cursor-pointer"
                  >
                    <span className="flex items-center gap-2.5"><Printer size={14} className="text-slate-600" /> Print Sheet</span>
                    <kbd className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-400 font-mono">Ctrl+P</kbd>
                  </button>
                  <button
                    onClick={() => {
                      const jobsForDay = dailyJobs.filter(j => j.date === selectedDate)
                      pushState(JSON.parse(JSON.stringify(jobsForDay)))
                      setShowThreeDotMenu(false)
                      showToast('Reset to saved CRM state')
                    }}
                    className="w-full px-3.5 py-2 text-left hover:bg-slate-50 flex items-center gap-2.5 font-medium text-slate-700 cursor-pointer"
                  >
                    <RotateCcw size={14} className="text-amber-600" /> Revert to Saved
                  </button>
                </div>

                {/* Section 3: Audit & Change Log History */}
                <div className="py-1">
                  <div className="px-3.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400">Audit & Change History</div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowThreeDotMenu(false)
                      setShowChangeLogModal(true)
                    }}
                    className="w-full px-3.5 py-2 text-left hover:bg-emerald-50 flex items-center justify-between font-medium text-slate-700 cursor-pointer transition-colors"
                  >
                    <span className="flex items-center gap-2.5">
                      <History size={14} className="text-emerald-700" />
                      <span className="font-bold text-slate-900">Change Log History</span>
                    </span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 font-extrabold border border-emerald-200">
                      Audit
                    </span>
                  </button>
                </div>

                {/* Section 4: Row Actions (when active cell selected) */}
                {activeCell && (
                  <div className="py-1">
                    <div className="px-3.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400">Row Actions</div>
                    <button
                      onClick={() => {
                        handleDuplicateRow(activeCell.rowIdx)
                        setShowThreeDotMenu(false)
                      }}
                      className="w-full px-3.5 py-2 text-left hover:bg-slate-50 flex items-center gap-2.5 font-medium text-slate-700 cursor-pointer"
                    >
                      <Copy size={14} className="text-blue-600" /> Duplicate Active Row
                    </button>
                    <button
                      onClick={() => {
                        handleDeleteRow(activeCell.rowIdx)
                        setShowThreeDotMenu(false)
                      }}
                      className="w-full px-3.5 py-2 text-left hover:bg-red-50 text-red-600 flex items-center gap-2.5 font-medium cursor-pointer"
                    >
                      <Trash2 size={14} /> Delete Active Row
                    </button>
                  </div>
                )}

                {/* Section 5: Tools & Zoom */}
                <div className="py-1">
                  <div className="px-3.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400">Tools & Zoom</div>
                  <button
                    onClick={() => { handleRecalculateHours(); setShowThreeDotMenu(false) }}
                    className="w-full px-3.5 py-2 text-left hover:bg-slate-50 flex items-center gap-2.5 font-medium text-emerald-800 cursor-pointer"
                  >
                    <Sparkles size={14} className="text-emerald-600" /> Recalculate Duty & OT Hours
                  </button>
                  <div className="px-3.5 py-2 flex items-center justify-between text-[11px] text-slate-500 font-bold">
                    <span>Zoom Scale</span>
                    <div className="flex items-center gap-1">
                      {[90, 100, 110].map(z => (
                        <button
                          key={z}
                          onClick={() => setZoomLevel(z)}
                          className={`px-2 py-0.5 rounded text-[10.5px] font-bold cursor-pointer ${zoomLevel === z ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                        >
                          {z}%
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>



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

      {/* ── Autocomplete sources (UX-35): live employees and clients only (R-DATA-03) ── */}
      <datalist id="xl-staff">{staffOptions.map(n => <option key={n} value={n} />)}</datalist>
      <datalist id="xl-address">{addressOptions.map(n => <option key={n} value={n} />)}</datalist>
      <datalist id="xl-area">{areaOptions.map(n => <option key={n} value={n} />)}</datalist>
      <datalist id="xl-service">{serviceOptions.map(n => <option key={n} value={n} />)}</datalist>

      {/* ── Sub-Bar: Search on Left + Flat Borderless Filter Tabs + Action Controls & Mode Icons at Right ── */}
      <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between gap-3 text-[12px] shrink-0 shadow-2xs">
        {/* Left: Search input first, then flat borderless filter buttons */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* 1. Search Input First on Far Left */}
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search staff, location, client..."
              value={filterSearch}
              onChange={e => setFilterSearch(e.target.value)}
              className="pl-8 pr-7 py-1.5 text-[12px] border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:border-emerald-600 w-44 sm:w-56 font-medium text-slate-800 placeholder:text-slate-400 transition-all shadow-2xs"
            />
            {filterSearch && (
              <button
                onClick={() => setFilterSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* 2. Flat Borderless Filter Buttons: ALL, Monthly, Cash, Online, Pending, Project */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {(['ALL', 'Monthly', 'Cash', 'Online', 'Pending', 'Project'] as const).map(tab => {
              const count = tab === 'ALL' ? filterCounts.all : filterCounts[tab.toLowerCase() as keyof typeof filterCounts]
              const isActive = paymentModeFilter === tab
              const flatStyle = {
                ALL: isActive ? 'bg-emerald-700 text-white shadow-xs' : 'bg-slate-100 hover:bg-slate-200/80 text-slate-700',
                Monthly: isActive ? 'bg-indigo-600 text-white' : 'bg-indigo-50/70 hover:bg-indigo-100/80 text-indigo-900',
                Cash: isActive ? 'bg-emerald-600 text-white' : 'bg-emerald-50/70 hover:bg-emerald-100/80 text-emerald-900',
                Online: isActive ? 'bg-sky-600 text-white' : 'bg-sky-50/70 hover:bg-sky-100/80 text-sky-900',
                Pending: isActive ? 'bg-rose-600 text-white' : 'bg-rose-50/70 hover:bg-rose-100/80 text-rose-900',
                Project: isActive ? 'bg-purple-700 text-white shadow-xs' : 'bg-purple-50/70 hover:bg-purple-100/80 text-purple-900',
              }[tab]

              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setPaymentModeFilter(tab)}
                  className={`px-3 py-1.5 rounded-xl border-0 font-bold text-[11.5px] transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs ${flatStyle}`}
                >
                  <span>{tab}</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                    isActive ? 'bg-white/25 text-white' : 'bg-white/90 text-slate-800 shadow-2xs'
                  }`}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Right side: 'Columns' & 'Reset Column' buttons + View Mode Switcher at End */}
        <div className="flex items-center gap-2">
          {/* Columns Button with 'Columns' Text Label */}
          <button
            type="button"
            onClick={() => setShowColumnsModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 hover:text-slate-900 font-bold text-[11.5px] border border-slate-200/80 transition-all cursor-pointer shadow-2xs active:scale-95"
            title="Customize Columns (Show/Hide & Order)"
          >
            <Eye size={13} className="text-slate-600" />
            <span>Columns</span>
          </button>

          {/* Reset Column Button with 'Reset Column' Text Label */}
          <button
            type="button"
            onClick={resetColumnOrder}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 hover:text-slate-900 font-bold text-[11.5px] border border-slate-200/80 transition-all cursor-pointer shadow-2xs active:scale-95"
            title="Reset Column Sequence to Default"
          >
            <RotateCcw size={13} className="text-slate-600" />
            <span>Reset Column</span>
          </button>

          {/* Mode Switcher: Icons only at the very right end */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 shadow-2xs">
            <button
              type="button"
              onClick={() => {
                setViewMode('flat')
                safeSet('safaeewala_excel_view_mode', 'flat')
              }}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === 'flat'
                  ? 'bg-emerald-700 text-white shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/60'
              }`}
              title="Flat Grid View"
            >
              <Table size={15} />
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode('blocks')
                safeSet('safaeewala_excel_view_mode', 'blocks')
              }}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === 'blocks'
                  ? 'bg-emerald-700 text-white shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/60'
              }`}
              title="Cleaner Blocks View"
            >
              <Layers size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Main Spreadsheet Grid Container (Full Width Edge-to-Edge) ── */}
      <div className="flex-1 overflow-auto bg-white relative w-full">
        <table className="w-full border-collapse border border-slate-300 text-[12px] font-mono">
          {/* Header: Excel Column Letters (A, B, C...) */}
          <thead className="sticky top-0 z-20 bg-[#f3f4f6] text-slate-600 shadow-xs">
            <tr className="border-b border-slate-300">
              {columns.map(col => (
                <th
                  key={col.col}
                  style={{ width: `${getColWidth(col)}px`, minWidth: `${getColWidth(col)}px` }}
                  className={`h-6 border-r border-slate-300 text-center font-bold text-[11px] select-none ${
                    activeCell && columns.find(c => c.id === activeCell.colId)?.col === col.col
                      ? 'bg-emerald-200 text-emerald-950 font-black'
                      : 'bg-[#e5e7eb] text-slate-700'
                  }`}
                >
                  {col.col}
                </th>
              ))}
              <th className="w-28 border-r border-slate-300 bg-[#e5e7eb] text-[10px] font-bold text-center">Action</th>
            </tr>

            {/* Column Label / Name Row with Drag & Drop and Resizing Handles */}
            <tr className="border-b-2 border-slate-400 bg-slate-100 text-slate-800 font-sans font-bold text-[11.5px]">
              {columns.map(col => (
                <th
                  key={col.id}
                  draggable
                  onDragStart={e => handleDragStart(e, col.id)}
                  onDragOver={e => handleDragOver(e, col.id)}
                  onDrop={e => handleDrop(e, col.id)}
                  onDragEnd={() => { setDraggedColId(null); setDragOverColId(null) }}
                  onContextMenu={e => handleColumnHeaderContextMenu(e, col.id)}
                  style={{ width: `${getColWidth(col)}px`, minWidth: `${getColWidth(col)}px` }}
                  className={`relative px-2.5 py-1.5 border-r border-slate-300 text-left whitespace-nowrap cursor-grab active:cursor-grabbing select-none transition-colors group/colhdr ${
                    dragOverColId === col.id ? 'bg-emerald-100 border-l-4 border-l-emerald-600' : ''
                  } ${draggedColId === col.id ? 'opacity-40' : ''}`}
                  title={col.id === 'staff_name'
                    ? "Drag column to reorder · Right-click for Staff Block color · Drag edge to resize"
                    : "Drag column to reorder · Right-click header to color whole row · Drag edge to resize"
                  }
                >
                  <div className="flex items-center gap-1.5 pr-2">
                    <GripVertical size={11} className="text-slate-400 shrink-0" />
                    <span>{col.label}</span>
                  </div>
                  {/* Edge drag handle for resizing column width */}
                  <div
                    onMouseDown={e => handleStartResize(e, col.id, getColWidth(col))}
                    className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-emerald-500/60 transition-colors z-20"
                    title="Drag to resize column width"
                  />
                </th>
              ))}
              <th className="w-28 border-r border-slate-300 text-center text-[10.5px] font-bold">Action</th>
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
                    <tr
                      onContextMenu={e => handleContextMenu(e, group.jobs[0]?.globalIndex ?? 0, group.jobs[0]?.row, 'staff_name')}
                      className={`${palette.headerBg} ${palette.headerText} border-t-2 border-b border-black/20 select-none shadow-xs cursor-context-menu`}
                    >
                      <td colSpan={columns.length + 1} className="px-3 py-2">
                        <div className="flex items-center justify-between flex-wrap gap-2 font-sans">
                          {/* Left: Cleaner Info & Badges */}
                          <div className="flex items-center gap-3">
                            <span className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${palette.avatarBg} shadow-xs`}>
                              {(group.cleanerName || 'C').trim()[0]?.toUpperCase() || 'C'}
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


                          {/* Render Cells */}
                          {columns.map(col => {
                            const isCellActive = activeCell?.rowIdx === globalIndex && activeCell?.colId === col.id
                            const isCellEditing = editingCell?.rowIdx === globalIndex && editingCell?.colId === col.id

                            let rawVal = row[col.id as keyof DailyJob]
                            let displayVal: any = rawVal
                            const isBlankShift = !row.address && !row.start_time && !row.end_time && cleanNum(row.charges) === 0 && cleanNum(row.received) === 0
                            const mcInfo = getMultiCleanerPaymentInfo(row, gridRows)

                            if (col.id === 'team_name') {
                              if (isBlankShift) displayVal = ''
                              else if (mcInfo?.isSecondary) displayVal = mcInfo.teamRef
                              else if (mcInfo?.isPrimary && mcInfo.isMultiCleaner) displayVal = `${mcInfo.teamRef} (Lead)`
                              else displayVal = rawVal || ''
                            } else if (col.id === 'charges') {
                              if (isBlankShift) displayVal = ''
                              else if (mcInfo?.isSecondary) displayVal = `Added ${mcInfo.teamRef || 'Team'}`
                              else displayVal = cleanNum(displayVal) > 0 ? cleanNum(displayVal) : (cleanNum(displayVal) === 0 ? 0 : '')
                            } else if (col.id === 'received') {
                              if (isBlankShift) displayVal = ''
                              else if (mcInfo?.isSecondary) displayVal = `Reference ${mcInfo.primaryCleaner || 'Lead'}`
                              else displayVal = cleanNum(displayVal) > 0 ? cleanNum(displayVal) : (cleanNum(displayVal) === 0 ? 0 : '')
                            } else if (col.id === 'pending') {
                              if (isBlankShift) displayVal = ''
                              else if (mcInfo?.isSecondary) displayVal = 'Nil'
                              else displayVal = rowPending(row)
                            } else if (col.id === 'payment_mode') {
                              if (isBlankShift) displayVal = ''
                              else if (mcInfo?.isSecondary) displayVal = 'Above'
                              else displayVal = rawVal || ''
                            } else if (col.id === 'start_time' || col.id === 'end_time') {
                              displayVal = isBlankShift ? '' : (rawVal ? formatTime12h(rawVal) : '')
                            } else if (col.id === 'material') {
                              displayVal = isBlankShift ? '' : (rawVal ? (String(rawVal).toUpperCase() === 'NO' ? 'NO' : String(rawVal).toUpperCase() === 'YES' ? 'YES' : String(rawVal)) : '')
                            } else if (col.id === 'duty_hours') {
                              const d = cleanNum(rawVal)
                              displayVal = isBlankShift ? '' : (d > 0 ? d.toFixed(2) : '')
                            } else if (col.id === 'ot_hours') {
                              const ot = cleanNum(rawVal)
                              displayVal = isBlankShift ? '' : (ot > 0 ? ot.toFixed(2) : '')
                            } else if (col.type === 'number') {
                              displayVal = isBlankShift ? '' : cleanNum(displayVal)
                            }

                            const cellColorKey = cellColors[`${row.id}_${col.id}`]
                            const cellPalette = cellColorKey && (BLOCK_PALETTES[cellColorKey] || (cellColorKey.startsWith('#') ? makeHexPalette(cellColorKey) : null))
                            const colColorKey = columnColors[col.id]
                            const colPalette = colColorKey && (BLOCK_PALETTES[colColorKey] || (colColorKey.startsWith('#') ? makeHexPalette(colColorKey) : null))
                            const customRowPreset = row.row_color && ROW_COLOR_PRESETS.find(p => p.id === row.row_color)
                            const rowPalette = row.row_color && (BLOCK_PALETTES[row.row_color] || (row.row_color.startsWith('#') ? makeHexPalette(row.row_color) : null))

                            let cellBg: string | undefined = undefined
                            if (cellPalette) {
                              cellBg = cellPalette.solidBg
                            } else if (rowPalette) {
                              cellBg = rowPalette.solidBg
                            } else if (customRowPreset) {
                              cellBg = customRowPreset.circleColor
                            } else if (colPalette) {
                              cellBg = colPalette.solidBg
                            }

                            return (
                              <td
                                key={col.id}
                                onClick={() => handleCellClick(globalIndex, col.id)}
                                onDoubleClick={() => handleCellDoubleClick(globalIndex, col.id)}
                                onContextMenu={e => handleContextMenu(e, globalIndex, row, col.id)}
                                style={{
                                  width: `${getColWidth(col)}px`,
                                  minWidth: `${getColWidth(col)}px`,
                                  backgroundColor: cellBg,
                                }}
                                className={`h-7 px-2 border-r border-slate-200 ${isCellEditing ? 'overflow-visible z-30' : 'overflow-hidden'} text-ellipsis whitespace-nowrap cursor-cell transition-all relative ${
                                  isCellActive
                                    ? 'ring-2 ring-[#107c41] bg-white z-10 font-semibold'
                                    : ''
                                } ${col.type === 'number' || col.id === 'pending' ? 'text-right font-mono' : 'text-left'}`}
                              >
                                {isCellEditing ? (
                                  renderCellEditor(col, globalIndex, true)
                                ) : col.id === 'staff_name' ? (
                                  <div className="flex flex-col items-start leading-tight py-0.5">
                                    <span className="font-black text-white tracking-wide truncate">{displayVal}</span>
                                    {mcInfo?.teamRef && !isBlankShift && (
                                      <span className={`inline-flex items-center gap-0.5 text-[9.5px] font-black px-1.5 py-0.2 rounded-md mt-0.5 border shadow-2xs ${
                                        mcInfo.isPrimary ? 'bg-indigo-100 text-indigo-900 border-indigo-300' : 'bg-indigo-950/80 text-indigo-200 border-indigo-500/40'
                                      }`}>
                                        <span>{mcInfo.teamRef}</span>
                                        {mcInfo.isPrimary && <span className="text-[8.5px] text-indigo-400 font-extrabold">(Lead)</span>}
                                      </span>
                                    )}
                                    {!mcInfo?.teamRef && row.team_name && !isBlankShift && (
                                      <span className="inline-flex items-center text-[9.5px] font-black px-1.5 py-0.2 rounded-md mt-0.5 bg-indigo-950/80 text-indigo-200 border border-indigo-500/40">
                                        {row.team_name}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span
                                    title={
                                      mcInfo?.isSecondary
                                        ? col.id === 'charges'
                                          ? `Charges recorded under primary cleaner: ${mcInfo.primaryCleaner}`
                                          : col.id === 'received'
                                            ? `Payment received recorded under primary cleaner: ${mcInfo.primaryCleaner}`
                                            : col.id === 'pending'
                                              ? `Paid under primary cleaner: ${mcInfo.primaryCleaner}`
                                              : undefined
                                        : undefined
                                    }
                                    className={
                                      mcInfo?.isSecondary && (col.id === 'charges' || col.id === 'received')
                                        ? 'text-indigo-300 italic font-semibold text-[11px]'
                                        : mcInfo?.isSecondary && col.id === 'payment_mode'
                                          ? 'text-indigo-200 font-bold text-[11px]'
                                          : col.id === 'charges'
                                            ? 'text-amber-300 font-black drop-shadow-xs'
                                            : col.id === 'received'
                                              ? 'text-emerald-300 font-black drop-shadow-xs'
                                              : col.id === 'pending' && cleanNum(displayVal) > 0
                                                ? 'text-rose-200 font-black bg-rose-950/80 px-1.5 py-0.5 rounded border border-rose-500/40 text-[11px]'
                                                : 'text-slate-100 font-medium'
                                    }
                                  >
                                    {col.id === 'address' ? (
                                        <span className="inline-flex items-center gap-1.5 flex-wrap">
                                          <span>{cleanAddressDisplay(displayVal)}</span>
                                          {isAddressMonthly(displayVal) && (
                                            <span className="px-1.5 py-0.2 rounded text-[9.5px] font-extrabold bg-indigo-900/60 text-indigo-200 border border-indigo-500/40 shrink-0 not-italic">
                                              Monthly Client
                                            </span>
                                          )}
                                        </span>
                                      ) : (displayVal !== undefined && displayVal !== null && displayVal !== '' ? String(displayVal) : '')}
                                  </span>
                                )}
                              </td>
                            )
                          })}

                          {/* Action Column: Solid Black Icon Buttons Only */}
                          <td className="w-20 border-r border-slate-200 text-center px-1">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(row, globalIndex)}
                                className="p-1.5 rounded-lg bg-black hover:bg-slate-800 text-white shadow-xs cursor-pointer transition-colors"
                                title="Edit entry"
                              >
                                <Pencil size={12} className="text-white" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteRow(globalIndex)}
                                className="p-1.5 rounded-lg bg-black hover:bg-rose-950 text-white shadow-xs cursor-pointer transition-colors"
                                title="Delete row"
                              >
                                <Trash2 size={12} className="text-white" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </React.Fragment>
                )
              })}
            </tbody>
          ) : (
            /* 2. Flat Continuous Grid Mode (With 3-Row Staff Blocks, Merged Staff Cells & No Internal Grid Lines) */
            <tbody className="divide-y divide-slate-200">
              {visibleGridRows.map((row, rowIdx) => {
                const globalIndex = gridRows.findIndex(r => r.id === row.id)
                const targetIdx = globalIndex >= 0 ? globalIndex : rowIdx
                const isSelectedRow = activeCell?.rowIdx === targetIdx
                const rawStaff = (row.staff_name || 'Unassigned Staff').trim()
                const staffKey = rawStaff.toLowerCase()
                const palette = getCleanerPalette(rawStaff, cleanerIndexMap.get(staffKey) ?? 0)

                // ── Pre-calculated Staff Block Boundary & RowSpan Info ──
                const blockInfo = staffBlockInfoMap.get(row.id)
                const isFirstInBlock = blockInfo?.isFirst ?? true
                const isLastInBlock = blockInfo?.isLast ?? true
                const blockRowCount = blockInfo?.rowCount ?? 1
                const isMonthlyRow = row.payment_mode === 'Monthly'

                // ── Block Perimeter Borders: 2.5px solid boundary between cleaners ──
                const blockTopBorder = isFirstInBlock ? '2px solid #0f172a' : '1px solid #cbd5e1'
                const blockBottomBorder = isLastInBlock ? '2px solid #0f172a' : '1px solid #cbd5e1'

                // ── Row & Block Color Logic (Full Row/Block Implementation across all columns) ──
                // Check if user explicitly set a color for this cleaner block or row
                const customCleanerKey = cleanerColors[staffKey]
                const hasCustomBlockColor = !!customCleanerKey && !!BLOCK_PALETTES[customCleanerKey]
                const blockPalette = row.row_color && (BLOCK_PALETTES[row.row_color] || (row.row_color.startsWith('#') ? makeHexPalette(row.row_color) : null))
                const customRowPreset = row.row_color ? ROW_COLOR_PRESETS.find(p => p.id === row.row_color) : null

                // Monthly clients and regular rows default to clean white (#ffffff) unless user changes color
                let rowBg = '#ffffff'
                let isDarkRow = false

                if (blockPalette) {
                  rowBg = blockPalette.solidBg
                  isDarkRow = !blockPalette.isLight
                } else if (customRowPreset) {
                  rowBg = customRowPreset.circleColor
                  isDarkRow = false
                } else if (hasCustomBlockColor) {
                  const chosenPalette = BLOCK_PALETTES[customCleanerKey] || (customCleanerKey.startsWith('#') ? makeHexPalette(customCleanerKey) : null)
                  if (chosenPalette) {
                    rowBg = chosenPalette.solidBg
                    isDarkRow = !chosenPalette.isLight
                  }
                }

                return (
                  <tr
                    key={row.id}
                    onContextMenu={e => handleContextMenu(e, targetIdx, row)}
                    style={{ backgroundColor: rowBg }}
                    className={`transition-colors group hover:brightness-[0.98] ${
                      isSelectedRow ? 'ring-2 ring-inset ring-emerald-500 font-semibold shadow-xs' : ''
                    }`}
                  >
                    {/* Columns */}
                    {columns.map((col, cIdx) => {
                      // ── STAFF COLUMN: Merged cell spanning all rows of this cleaner with hidden internal grid lines ──
                      if (col.id === 'staff_name') {
                        if (!isFirstInBlock) {
                          // Skip rendering: cell is spanned down from the first row of this block
                          return null
                        }

                        const isStaffCellActive = activeCell?.rowIdx === targetIdx && activeCell?.colId === 'staff_name'
                        const isStaffCellEditing = editingCell?.rowIdx === targetIdx && editingCell?.colId === 'staff_name'

                        const blockTeams = Array.from(new Set(
                          gridRows
                            .filter(j => (j.staff_name || '').trim().toLowerCase() === staffKey)
                            .map(j => {
                              const mi = getMultiCleanerPaymentInfo(j, gridRows)
                              return mi?.teamRef || j.team_name
                            })
                            .filter(Boolean)
                        ))

                        return (
                          <td
                            key={col.id}
                            rowSpan={blockRowCount}
                            onClick={() => handleCellClick(targetIdx, col.id)}
                            onDoubleClick={() => handleCellDoubleClick(targetIdx, col.id)}
                            onContextMenu={e => handleContextMenu(e, targetIdx, row)}
                            style={{
                              width: `${getColWidth(col)}px`,
                              minWidth: `${getColWidth(col)}px`,
                              backgroundColor: rowBg,
                              borderLeft: `4px solid ${hasCustomBlockColor ? palette.solidBorder : '#0f172a'}`,
                              borderTop: blockTopBorder,
                              borderBottom: blockBottomBorder,
                              borderRight: '1px solid #cbd5e1',
                            }}
                            className={`align-middle text-center select-none cursor-cell transition-all relative group/staff px-2 py-2 ${
                              isStaffCellActive ? 'ring-2 ring-emerald-500 bg-white z-10' : ''
                            }`}
                            title="Staff Member · Double-click to edit Staff Name"
                          >
                            {isStaffCellEditing ? (
                              <input
                                ref={inputRef}
                                list="xl-staff"
                                value={editingCell.tempValue}
                                onChange={e => setEditingCell({ ...editingCell, tempValue: e.target.value })}
                                onBlur={commitCellEdit}
                                onKeyDown={handleEditorKeyDown}
                                className="w-full text-center text-[12px] font-bold border border-emerald-500 rounded p-1 outline-none bg-white text-slate-900 shadow-inner"
                                autoFocus
                              />
                            ) : (
                              <div className="flex flex-col items-center justify-center h-full min-h-[60px] px-2 text-center gap-1">
                                <span className={`font-bold text-[13px] tracking-tight select-text ${isDarkRow ? 'text-white' : 'text-slate-900'}`}>
                                  {blockInfo?.staffName || '—'}
                                </span>
                                {blockTeams.map(tName => (
                                  <span
                                    key={tName}
                                    className={`inline-flex items-center text-[9.5px] font-black px-1.5 py-0.2 rounded-md border shadow-2xs ${
                                      isDarkRow ? 'bg-indigo-950/80 text-indigo-200 border-indigo-500/40' : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                                    }`}
                                  >
                                    {tName}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                        )
                      }

                      // ── ALL OTHER COLUMNS (Rendered row by row for each shift in the block) ──
                      const isCellActive = activeCell?.rowIdx === targetIdx && activeCell?.colId === col.id
                      const isCellEditing = editingCell?.rowIdx === targetIdx && editingCell?.colId === col.id

                      let rawVal = row[col.id as keyof DailyJob]
                      let displayVal: any = rawVal
                      const isBlankShift = !row.address && !row.start_time && !row.end_time && cleanNum(row.charges) === 0 && cleanNum(row.received) === 0
                      const pendVal = rowPending(row)
                      const mcInfo = getMultiCleanerPaymentInfo(row, gridRows)
                      const isPendingDue = col.id === 'pending' && pendVal > 0 && !mcInfo?.isSecondary

                      if (col.id === 'team_name') {
                        if (isBlankShift) displayVal = ''
                        else if (mcInfo?.isSecondary) displayVal = mcInfo.teamRef
                        else if (mcInfo?.isPrimary && mcInfo.isMultiCleaner) displayVal = `${mcInfo.teamRef} (Lead)`
                        else displayVal = rawVal || ''
                      } else if (col.id === 'charges') {
                        if (isBlankShift) displayVal = ''
                        else if (mcInfo?.isSecondary) displayVal = `Added ${mcInfo.teamRef || 'Team'}`
                        else displayVal = cleanNum(displayVal) > 0 ? cleanNum(displayVal) : (cleanNum(displayVal) === 0 ? 0 : '')
                      } else if (col.id === 'received') {
                        if (isBlankShift) displayVal = ''
                        else if (mcInfo?.isSecondary) displayVal = `Reference ${mcInfo.primaryCleaner || 'Lead'}`
                        else displayVal = cleanNum(displayVal) > 0 ? cleanNum(displayVal) : (cleanNum(displayVal) === 0 ? 0 : '')
                      } else if (col.id === 'pending') {
                        if (isBlankShift) {
                          displayVal = ''
                        } else if (mcInfo?.isSecondary) {
                          displayVal = 'Nil'
                        } else if (pendVal > 0) {
                          displayVal = pendVal
                        } else {
                          displayVal = 'Nil'
                        }
                      } else if (col.id === 'payment_mode') {
                        if (isBlankShift) displayVal = ''
                        else if (mcInfo?.isSecondary) displayVal = 'Above'
                        else displayVal = rawVal || ''
                      } else if (col.id === 'ot_hours') {
                        const ot = cleanNum(rawVal)
                        displayVal = isBlankShift ? '' : (ot > 0 ? ot.toFixed(2) : '0.00')
                      } else if (col.id === 'duty_hours') {
                        const d = cleanNum(rawVal)
                        displayVal = d > 0 ? d.toFixed(2) : ''
                      } else if (col.id === 'start_time' || col.id === 'end_time') {
                        displayVal = isBlankShift ? '' : (rawVal ? formatTime12h(rawVal) : '')
                      } else if (col.id === 'material') {
                        displayVal = isBlankShift ? '' : (rawVal ? (String(rawVal).toUpperCase() === 'NO' ? 'NO' : String(rawVal).toUpperCase() === 'YES' ? 'YES' : String(rawVal)) : '')
                      } else if (col.type === 'number') {
                        displayVal = isBlankShift ? '' : (cleanNum(displayVal) > 0 ? cleanNum(displayVal) : (cleanNum(displayVal) === 0 ? 0 : ''))
                      }

                      const cellColorKey = cellColors[`${row.id}_${col.id}`]
                      const cellPalette = cellColorKey && (BLOCK_PALETTES[cellColorKey] || (cellColorKey.startsWith('#') ? makeHexPalette(cellColorKey) : null))
                      const colColorKey = columnColors[col.id]
                      const colPalette = colColorKey && (BLOCK_PALETTES[colColorKey] || (colColorKey.startsWith('#') ? makeHexPalette(colColorKey) : null))
                      const cellBg = cellPalette ? cellPalette.solidBg : (colPalette ? colPalette.solidBg : rowBg)
                      const isDarkCell = cellPalette ? !cellPalette.isLight : (colPalette ? !colPalette.isLight : isDarkRow)

                      return (
                        <td
                          key={col.id}
                          onClick={() => handleCellClick(targetIdx, col.id)}
                          onDoubleClick={() => handleCellDoubleClick(targetIdx, col.id)}
                          onContextMenu={e => handleContextMenu(e, targetIdx, row, col.id)}
                          style={{
                            width: `${getColWidth(col)}px`,
                            minWidth: `${getColWidth(col)}px`,
                            backgroundColor: isCellActive ? (palette.isLight ? '#ffffff' : '#090d16') : cellBg,
                            borderTop: blockTopBorder,
                            borderBottom: blockBottomBorder,
                            borderRight: palette.isLight ? '1px solid #cbd5e1' : '1px solid rgba(255, 255, 255, 0.12)',
                          }}
                          className={`h-7.5 px-2 ${isCellEditing ? 'overflow-visible z-30' : 'overflow-hidden'} text-ellipsis whitespace-nowrap cursor-cell transition-all relative ${
                            isCellActive
                              ? (palette.isLight ? 'ring-2 ring-emerald-600 bg-white z-10 font-bold text-slate-900 shadow-md' : 'ring-2 ring-emerald-400 bg-slate-950 z-10 font-bold text-white shadow-md')
                              : ''
                          } ${col.type === 'number' || col.id === 'pending' ? 'text-right font-mono' : 'text-left'}`}
                        >
                          {isCellEditing ? (
                            renderCellEditor(col, targetIdx, palette.isLight)
                          ) : (
                            <span
                              title={
                                mcInfo?.isSecondary
                                  ? col.id === 'charges'
                                    ? `Charges recorded under primary cleaner: ${mcInfo.primaryCleaner}`
                                    : col.id === 'received'
                                      ? `Payment received recorded under primary cleaner: ${mcInfo.primaryCleaner}`
                                      : col.id === 'pending'
                                        ? `Paid under primary cleaner: ${mcInfo.primaryCleaner}`
                                        : undefined
                                  : undefined
                              }
                              className={
                                mcInfo?.isSecondary && (col.id === 'charges' || col.id === 'received')
                                  ? (isDarkCell ? 'text-indigo-300 italic font-semibold text-[11.5px]' : 'text-indigo-700 italic font-semibold text-[11.5px]')
                                  : mcInfo?.isSecondary && col.id === 'payment_mode'
                                    ? (isDarkCell ? 'text-indigo-200 font-bold text-[11px]' : 'text-indigo-800 font-bold text-[11px]')
                                    : isPendingDue
                                      ? (isDarkCell ? 'text-rose-300 font-black drop-shadow-xs' : 'text-rose-600 font-black')
                                      : col.id === 'pending' && displayVal === 'Nil'
                                        ? (isDarkCell ? 'text-slate-200 font-bold' : 'text-slate-800 font-bold')
                                        : col.id === 'charges' || col.id === 'received'
                                          ? (isDarkCell ? 'text-amber-300 font-black drop-shadow-xs' : 'text-slate-900 font-bold')
                                          : col.id === 'team_name' && displayVal
                                            ? (isDarkCell ? 'font-bold text-indigo-300 bg-indigo-950/60 px-1.5 py-0.5 rounded border border-indigo-500/40 text-[11px]' : 'font-bold text-indigo-800 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200 text-[11px]')
                                            : (isDarkCell ? 'text-white font-medium' : 'text-slate-800 font-medium')
                              }
                            >
                              {col.id === 'address' ? (
                                        <span className="inline-flex items-center gap-1.5 flex-wrap">
                                          <span>{cleanAddressDisplay(displayVal)}</span>
                                          {isAddressMonthly(displayVal) && (
                                            <span className="px-1.5 py-0.2 rounded text-[9.5px] font-extrabold bg-indigo-900/60 text-indigo-200 border border-indigo-500/40 shrink-0 not-italic">
                                              Monthly Client
                                            </span>
                                          )}
                                        </span>
                                      ) : (displayVal !== undefined && displayVal !== null && displayVal !== '' ? String(displayVal) : '')}
                            </span>
                          )}
                        </td>
                      )
                    })}

                    {/* Action Column: Visible Color Scheme Icons (Solid Black Background Removed) */}
                    <td
                      style={{
                        backgroundColor: rowBg,
                        borderRight: `4px solid ${hasCustomBlockColor ? palette.solidBorder : '#0f172a'}`,
                        borderTop: blockTopBorder,
                        borderBottom: blockBottomBorder,
                      }}
                      className="w-20 text-center px-1"
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(row, targetIdx)}
                          className={`p-1.5 rounded-lg border transition-all cursor-pointer shadow-2xs ${
                            isDarkRow
                              ? 'border-white/25 bg-white/10 hover:bg-emerald-500/25 text-white hover:text-emerald-300'
                              : 'border-slate-300 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-500 text-slate-700 hover:text-emerald-800'
                          }`}
                          title="Edit entry"
                        >
                          <Pencil size={12} className={isDarkRow ? 'text-white' : 'text-slate-700'} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteRow(targetIdx)}
                          className={`p-1.5 rounded-lg border transition-all cursor-pointer shadow-2xs ${
                            isDarkRow
                              ? 'border-white/25 bg-white/10 hover:bg-rose-500/25 text-rose-300 hover:text-rose-200'
                              : 'border-slate-300 bg-slate-50 hover:bg-rose-50 hover:border-rose-500 text-slate-700 hover:text-rose-600'
                          }`}
                          title="Delete row"
                        >
                          <Trash2 size={12} className={isDarkRow ? 'text-rose-300' : 'text-slate-700'} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          )}


        </table>

        {/* ── Bottom Table Action: Add New Empty Row (Blank Cleaner Block) ── */}
        <div className="p-3 bg-slate-100/80 border-t border-slate-300 flex items-center justify-center">
          <button
            type="button"
            onClick={handleAddBlankCleanerBlock}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-[12px] shadow-sm transition-all cursor-pointer active:scale-95"
            title="Add strictly 3 new empty rows (new cleaner block)"
          >
            <Plus size={14} className="stroke-[2.5] shrink-0" />
            <span>Add New Empty Row (3 Rows)</span>
          </button>
        </div>

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
          {(() => {
            const isStaffSection = (contextMenu.colId || 'staff_name') === 'staff_name'
            const currentColDef = columns.find(c => c.id === contextMenu.colId)

            return (
              <>
                {/* Header */}
                <div className="px-3 py-1.5 border-b border-slate-100 flex items-center justify-between text-[11px] text-slate-400 font-bold">
                  <span>ROW #{contextMenu.rowIdx + 1} {currentColDef && !isStaffSection ? `· ${currentColDef.label}` : ''}</span>
                  <span className="font-semibold text-slate-700 truncate max-w-[120px]">{contextMenu.job.staff_name || 'Unassigned'}</span>
                </div>

                {/* Staff Block Level Actions: Only available when right-clicking on Staff Name section */}
                {isStaffSection && (
                  <div className="py-1">
                    <button
                      type="button"
                      onClick={() => {
                        const sName = contextMenu.job.staff_name || ''
                        const bInfo = staffBlockInfoMap.get(contextMenu.job.id)
                        handleAddRowToStaff(sName, bInfo?.lastRowIdx ?? contextMenu.rowIdx)
                        setContextMenu(null)
                      }}
                      className="w-full px-3.5 py-2 text-left hover:bg-emerald-50 text-slate-800 hover:text-emerald-900 flex items-center gap-2.5 font-semibold transition-colors cursor-pointer"
                    >
                      <Plus size={15} className="text-emerald-700" />
                      <span>Add Row to {contextMenu.job.staff_name || 'Staff'} (Expand Block)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        handleAddEmptyBlockAbove(contextMenu.job, contextMenu.rowIdx)
                        setContextMenu(null)
                      }}
                      className="w-full px-3.5 py-2 text-left hover:bg-emerald-50 text-slate-800 hover:text-emerald-900 flex items-center gap-2.5 font-semibold transition-colors cursor-pointer"
                      title="Add a new 3-row empty cleaner block above this staff block"
                    >
                      <ArrowUpCircle size={15} className="text-emerald-700" />
                      <span>Add New Empty Block Above</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        handleAddEmptyBlockBelow(contextMenu.job, contextMenu.rowIdx)
                        setContextMenu(null)
                      }}
                      className="w-full px-3.5 py-2 text-left hover:bg-emerald-50 text-slate-800 hover:text-emerald-900 flex items-center gap-2.5 font-semibold transition-colors cursor-pointer"
                      title="Add a new 3-row empty cleaner block below this staff block"
                    >
                      <ArrowDownCircle size={15} className="text-emerald-700" />
                      <span>Add New Empty Block Below</span>
                    </button>
                    <div className="h-px bg-slate-100 my-1" />
                  </div>
                )}

                {/* Row-Level Actions (Duplicate / Delete Block / Clear) */}
                <div className="py-0.5">
                  <button
                    type="button"
                    onClick={() => handleDuplicateRow(contextMenu.rowIdx)}
                    className="w-full px-3.5 py-1.5 text-left hover:bg-slate-100 text-slate-700 flex items-center gap-2.5 font-medium transition-colors cursor-pointer"
                  >
                    <Copy size={14} className="text-blue-600" />
                    <span>Duplicate Row #{contextMenu.rowIdx + 1}</span>
                  </button>

                  {/* Delete Block (Directly below Duplicate button per instruction) */}
                  <button
                    type="button"
                    onClick={() => handleDeleteStaffBlock(contextMenu.job)}
                    className="w-full px-3.5 py-1.5 text-left hover:bg-rose-50 text-rose-700 flex items-center gap-2.5 font-semibold transition-colors cursor-pointer"
                    title={`Delete entire staff block for ${contextMenu.job.staff_name || 'this cleaner'}`}
                  >
                    <Trash2 size={14} className="text-rose-600 shrink-0" />
                    <span>Delete Block ({contextMenu.job.staff_name || 'Staff Block'})</span>
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

                {/* ── COLOR CUSTOMIZATION PANEL ── */}
                {isStaffSection ? (
                  /* 1. Whole Staff Block Color (Only when right-clicking on Staff Name) */
                  <div className="px-3 py-2 bg-white text-slate-800 rounded-2xl mx-1.5 border border-slate-200/90 shadow-md">
                    <div className="flex items-center justify-between gap-2 mb-1.5 pb-1 border-b border-slate-100">
                      <div className="flex items-center gap-1.5 font-bold text-slate-900 text-[11.5px]">
                        <Palette size={13} className="text-teal-600" />
                        <span>Staff Block Color</span>
                      </div>
                      <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                        <button
                          type="button"
                          onMouseDown={e => e.stopPropagation()}
                          onClick={e => {
                            e.stopPropagation()
                            setColorPaletteTab('light')
                            safeSet('safaeewala_excel_color_tab', 'light')
                          }}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                            colorPaletteTab === 'light' ? 'bg-teal-600 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          Light
                        </button>
                        <button
                          type="button"
                          onMouseDown={e => e.stopPropagation()}
                          onClick={e => {
                            e.stopPropagation()
                            setColorPaletteTab('solid')
                            safeSet('safaeewala_excel_color_tab', 'solid')
                          }}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                            colorPaletteTab === 'solid' ? 'bg-teal-600 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          Solid
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] mb-1 px-0.5">
                      <span className="text-slate-500 font-medium">Whole Staff Block:</span>
                      <span className="text-teal-900 font-bold truncate max-w-[150px] bg-teal-50 px-2 py-0.5 rounded border border-teal-200 text-[10.5px]">
                        {contextMenu.job.staff_name || 'Staff Block'}
                      </span>
                    </div>

                    {/* White Color Option at Top of Palette */}
                    <div className="mb-1.5">
                      <button
                        type="button"
                        onMouseDown={e => e.stopPropagation()}
                        onClick={e => {
                          e.stopPropagation()
                          setBlockColor(contextMenu.job, contextMenu.rowIdx, 'white')
                        }}
                        className={`w-full py-1.5 px-2.5 rounded-xl border flex items-center justify-between text-[11px] font-bold transition-all cursor-pointer ${
                          contextMenu.job.row_color === 'white'
                            ? 'bg-slate-100 border-teal-500 ring-2 ring-teal-500/25 text-slate-900 shadow-2xs'
                            : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700 shadow-2xs'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-4 h-4 rounded-full bg-white border border-slate-300 shadow-2xs flex items-center justify-center">
                            {contextMenu.job.row_color === 'white' && <Check size={10} className="text-slate-900 stroke-[3]" />}
                          </span>
                          <span>Pure White (Default / Clean)</span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">#FFFFFF</span>
                      </button>
                    </div>

                    {/* Compact Custom Color Slider & Brightness Bar */}
                    <div className="bg-slate-50/90 p-2 rounded-xl border border-slate-200 mb-2 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-600 flex items-center gap-1">
                          <SlidersHorizontal size={11} className="text-teal-600" />
                          Custom Hue & Brightness
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-black/15 shadow-2xs shrink-0"
                            style={{ backgroundColor: currentCustomHex }}
                          />
                          <span className="font-mono text-[10px] font-bold text-slate-700 uppercase">
                            {currentCustomHex}
                          </span>
                        </div>
                      </div>

                      {/* Hue Slider */}
                      <div className="space-y-0.5">
                        <div className="flex justify-between text-[9px] text-slate-400 font-semibold leading-none">
                          <span>Color Hue</span>
                          <span>{customHue}°</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="360"
                          value={customHue}
                          onMouseDown={e => e.stopPropagation()}
                          onChange={e => setCustomHue(Number(e.target.value))}
                          className="w-full h-1.5 rounded-md appearance-none cursor-pointer outline-none block"
                          style={{ background: 'linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)' }}
                        />
                      </div>

                      {/* Brightness / Lightness Slider */}
                      <div className="space-y-0.5">
                        <div className="flex justify-between text-[9px] text-slate-400 font-semibold leading-none">
                          <span>Brightness</span>
                          <span>{customLightness}%</span>
                        </div>
                        <input
                          type="range"
                          min="15"
                          max="95"
                          value={customLightness}
                          onMouseDown={e => e.stopPropagation()}
                          onChange={e => setCustomLightness(Number(e.target.value))}
                          className="w-full h-1.5 rounded-md appearance-none cursor-pointer outline-none block"
                          style={{ background: `linear-gradient(to right, hsl(${customHue}, 80%, 15%) 0%, hsl(${customHue}, 80%, 50%) 50%, hsl(${customHue}, 80%, 95%) 100%)` }}
                        />
                      </div>

                      {/* Apply & Save Buttons */}
                      <div className="flex items-center gap-1.5 pt-0.5">
                        <button
                          type="button"
                          onMouseDown={e => e.stopPropagation()}
                          onClick={e => {
                            e.stopPropagation()
                            setBlockColor(contextMenu.job, contextMenu.rowIdx, currentCustomHex)
                          }}
                          className="flex-1 py-1 px-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-[10.5px] transition-colors cursor-pointer text-center shadow-2xs"
                        >
                          Apply Custom Color
                        </button>
                        <button
                          type="button"
                          onMouseDown={e => e.stopPropagation()}
                          onClick={e => {
                            e.stopPropagation()
                            handleSaveFavoriteColor(currentCustomHex)
                          }}
                          className="py-1 px-2 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 font-bold text-[10.5px] transition-colors cursor-pointer flex items-center gap-1 shrink-0"
                          title="Save to favorites"
                        >
                          <Star size={11} className="text-amber-600 fill-amber-500" />
                          <span>Save</span>
                        </button>
                      </div>

                      {/* Saved Favorites Row */}
                      {favoriteColors.length > 0 && (
                        <div className="pt-1 border-t border-slate-200/80 flex items-center gap-1 overflow-x-auto [scrollbar-width:none]">
                          <span className="text-[9px] font-bold text-slate-400 shrink-0">Saved:</span>
                          {favoriteColors.map(hex => (
                            <div key={hex} className="group relative shrink-0">
                              <button
                                type="button"
                                onMouseDown={e => e.stopPropagation()}
                                onClick={e => {
                                  e.stopPropagation()
                                  setBlockColor(contextMenu.job, contextMenu.rowIdx, hex)
                                }}
                                style={{ backgroundColor: hex }}
                                className="w-4 h-4 rounded-full border border-black/15 shadow-2xs hover:scale-115 transition-transform cursor-pointer"
                                title={`Apply saved color ${hex}`}
                              />
                              <button
                                type="button"
                                onMouseDown={e => e.stopPropagation()}
                                onClick={e => handleRemoveFavoriteColor(hex, e)}
                                className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-slate-800 text-white text-[8px] hidden group-hover:flex items-center justify-center cursor-pointer"
                                title="Remove"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Presets Grid */}
                    <div className="grid grid-cols-5 gap-2 py-1 place-items-center">
                      {(colorPaletteTab === 'light' ? LIGHT_PALETTE_KEYS : SOLID_PALETTE_KEYS).map(pk => {
                        const p = BLOCK_PALETTES[pk]
                        const currentPalette = getCleanerPalette(contextMenu.job.staff_name, 0, contextMenu.job.row_color)
                        const isSelected = contextMenu.job.row_color === p.id || (!contextMenu.job.row_color && currentPalette.id === p.id)
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onMouseDown={e => e.stopPropagation()}
                            onClick={e => {
                              e.stopPropagation()
                              setBlockColor(contextMenu.job, contextMenu.rowIdx, p.id)
                            }}
                            style={{ backgroundColor: p.solidBg, borderColor: p.solidBorder }}
                            className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all cursor-pointer shadow-2xs hover:scale-110 relative ${
                              isSelected ? 'ring-2 ring-teal-500 ring-offset-2 scale-110 shadow-sm' : 'hover:border-slate-400'
                            }`}
                            title={`${p.name} (${colorPaletteTab === 'light' ? 'Light' : 'Solid'})`}
                          >
                            {isSelected && (
                              <Check
                                size={11}
                                className={p.isLight ? 'text-slate-900 stroke-[3]' : 'text-white stroke-[3]'}
                              />
                            )}
                          </button>
                        )
                      })}
                    </div>

                    <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
                      <span>{colorPaletteTab === 'light' ? '20 Light Colors' : '20 Solid Colors'}</span>
                      <button
                        type="button"
                        onMouseDown={e => e.stopPropagation()}
                        onClick={e => {
                          e.stopPropagation()
                          resetBlockColor(contextMenu.job, contextMenu.rowIdx)
                        }}
                        className="text-teal-700 hover:text-teal-900 underline font-semibold cursor-pointer"
                      >
                        Reset Block
                      </button>
                    </div>
                  </div>
                ) : (
                  /* 2. Granular Color Customizer (Specific Cell Only vs Whole Row) */
                  <div className="px-3 py-2 bg-white text-slate-800 rounded-2xl mx-1.5 border border-slate-200/90 shadow-md">
                    <div className="flex items-center justify-between gap-2 mb-1.5 pb-1 border-b border-slate-100">
                      <div className="flex items-center gap-1.5 font-bold text-slate-900 text-[11.5px]">
                        <Palette size={13} className="text-teal-600" />
                        <span>{colorTargetScope === 'cell' ? 'Cell Color' : 'Whole Row Color'}</span>
                      </div>
                      <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                        <button
                          type="button"
                          onMouseDown={e => e.stopPropagation()}
                          onClick={e => {
                            e.stopPropagation()
                            setColorPaletteTab('light')
                            safeSet('safaeewala_excel_color_tab', 'light')
                          }}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                            colorPaletteTab === 'light' ? 'bg-teal-600 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          Light
                        </button>
                        <button
                          type="button"
                          onMouseDown={e => e.stopPropagation()}
                          onClick={e => {
                            e.stopPropagation()
                            setColorPaletteTab('solid')
                            safeSet('safaeewala_excel_color_tab', 'solid')
                          }}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                            colorPaletteTab === 'solid' ? 'bg-teal-600 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          Solid
                        </button>
                      </div>
                    </div>

                    {/* Scope Selector: Specific Cell Only vs Whole Row */}
                    <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl border border-slate-200 mb-1.5">
                      <button
                        type="button"
                        onMouseDown={e => e.stopPropagation()}
                        onClick={e => {
                          e.stopPropagation()
                          setColorTargetScope('cell')
                        }}
                        className={`flex-1 py-1 px-1.5 rounded-lg text-[10.5px] font-bold transition-all cursor-pointer truncate ${
                          colorTargetScope === 'cell' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                        }`}
                        title="Change color of ONLY this specific cell"
                      >
                        This Cell ({currentColDef?.label || contextMenu.colId})
                      </button>
                      <button
                        type="button"
                        onMouseDown={e => e.stopPropagation()}
                        onClick={e => {
                          e.stopPropagation()
                          setColorTargetScope('row')
                        }}
                        className={`flex-1 py-1 px-1.5 rounded-lg text-[10.5px] font-bold transition-all cursor-pointer truncate ${
                          colorTargetScope === 'row' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                        }`}
                        title="Change color of the entire row"
                      >
                        Whole Row #{contextMenu.rowIdx + 1}
                      </button>
                    </div>

                    {/* White Color Option at Top of Palette */}
                    <div className="mb-1.5">
                      <button
                        type="button"
                        onMouseDown={e => e.stopPropagation()}
                        onClick={e => {
                          e.stopPropagation()
                          if (colorTargetScope === 'cell') {
                            handleSetCellColor(contextMenu.job.id, contextMenu.colId, 'white')
                          } else {
                            handleSetSingleRowColor(contextMenu.rowIdx, 'white')
                          }
                        }}
                        className={`w-full py-1.5 px-2.5 rounded-xl border flex items-center justify-between text-[11px] font-bold transition-all cursor-pointer ${
                          (colorTargetScope === 'cell' ? cellColors[`${contextMenu.job.id}_${contextMenu.colId}`] === 'white' : contextMenu.job.row_color === 'white')
                            ? 'bg-slate-100 border-teal-500 ring-2 ring-teal-500/25 text-slate-900 shadow-2xs'
                            : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700 shadow-2xs'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-4 h-4 rounded-full bg-white border border-slate-300 shadow-2xs flex items-center justify-center">
                            {(colorTargetScope === 'cell' ? cellColors[`${contextMenu.job.id}_${contextMenu.colId}`] === 'white' : contextMenu.job.row_color === 'white') && (
                              <Check size={10} className="text-slate-900 stroke-[3]" />
                            )}
                          </span>
                          <span>Pure White (Default / Clean)</span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">#FFFFFF</span>
                      </button>
                    </div>

                    {/* Compact Custom Color Slider & Brightness Bar */}
                    <div className="bg-slate-50/90 p-2 rounded-xl border border-slate-200 mb-2 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-600 flex items-center gap-1">
                          <SlidersHorizontal size={11} className="text-teal-600" />
                          Custom Hue & Brightness
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-black/15 shadow-2xs shrink-0"
                            style={{ backgroundColor: currentCustomHex }}
                          />
                          <span className="font-mono text-[10px] font-bold text-slate-700 uppercase">
                            {currentCustomHex}
                          </span>
                        </div>
                      </div>

                      {/* Hue Slider */}
                      <div className="space-y-0.5">
                        <div className="flex justify-between text-[9px] text-slate-400 font-semibold leading-none">
                          <span>Color Hue</span>
                          <span>{customHue}°</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="360"
                          value={customHue}
                          onMouseDown={e => e.stopPropagation()}
                          onChange={e => setCustomHue(Number(e.target.value))}
                          className="w-full h-1.5 rounded-md appearance-none cursor-pointer outline-none block"
                          style={{ background: 'linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)' }}
                        />
                      </div>

                      {/* Brightness / Lightness Slider */}
                      <div className="space-y-0.5">
                        <div className="flex justify-between text-[9px] text-slate-400 font-semibold leading-none">
                          <span>Brightness</span>
                          <span>{customLightness}%</span>
                        </div>
                        <input
                          type="range"
                          min="15"
                          max="95"
                          value={customLightness}
                          onMouseDown={e => e.stopPropagation()}
                          onChange={e => setCustomLightness(Number(e.target.value))}
                          className="w-full h-1.5 rounded-md appearance-none cursor-pointer outline-none block"
                          style={{ background: `linear-gradient(to right, hsl(${customHue}, 80%, 15%) 0%, hsl(${customHue}, 80%, 50%) 50%, hsl(${customHue}, 80%, 95%) 100%)` }}
                        />
                      </div>

                      {/* Apply & Save Buttons */}
                      <div className="flex items-center gap-1.5 pt-0.5">
                        <button
                          type="button"
                          onMouseDown={e => e.stopPropagation()}
                          onClick={e => {
                            e.stopPropagation()
                            if (colorTargetScope === 'cell') {
                              handleSetCellColor(contextMenu.job.id, contextMenu.colId, currentCustomHex)
                            } else {
                              handleSetSingleRowColor(contextMenu.rowIdx, currentCustomHex)
                            }
                          }}
                          className="flex-1 py-1 px-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-[10.5px] transition-colors cursor-pointer text-center shadow-2xs"
                        >
                          Apply Custom Color
                        </button>
                        <button
                          type="button"
                          onMouseDown={e => e.stopPropagation()}
                          onClick={e => {
                            e.stopPropagation()
                            handleSaveFavoriteColor(currentCustomHex)
                          }}
                          className="py-1 px-2 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 font-bold text-[10.5px] transition-colors cursor-pointer flex items-center gap-1 shrink-0"
                          title="Save to favorites"
                        >
                          <Star size={11} className="text-amber-600 fill-amber-500" />
                          <span>Save</span>
                        </button>
                      </div>

                      {/* Saved Favorites Row */}
                      {favoriteColors.length > 0 && (
                        <div className="pt-1 border-t border-slate-200/80 flex items-center gap-1 overflow-x-auto [scrollbar-width:none]">
                          <span className="text-[9px] font-bold text-slate-400 shrink-0">Saved:</span>
                          {favoriteColors.map(hex => (
                            <div key={hex} className="group relative shrink-0">
                              <button
                                type="button"
                                onMouseDown={e => e.stopPropagation()}
                                onClick={e => {
                                  e.stopPropagation()
                                  if (colorTargetScope === 'cell') {
                                    handleSetCellColor(contextMenu.job.id, contextMenu.colId, hex)
                                  } else {
                                    handleSetSingleRowColor(contextMenu.rowIdx, hex)
                                  }
                                }}
                                style={{ backgroundColor: hex }}
                                className="w-4 h-4 rounded-full border border-black/15 shadow-2xs hover:scale-115 transition-transform cursor-pointer"
                                title={`Apply favorite ${hex}`}
                              />
                              <button
                                type="button"
                                onMouseDown={e => e.stopPropagation()}
                                onClick={e => handleRemoveFavoriteColor(hex, e)}
                                className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-slate-800 text-white text-[8px] hidden group-hover:flex items-center justify-center cursor-pointer"
                                title="Remove"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Presets Grid */}
                    <div className="grid grid-cols-5 gap-2 py-1 place-items-center">
                      {(colorPaletteTab === 'light' ? LIGHT_PALETTE_KEYS : SOLID_PALETTE_KEYS).map(pk => {
                        const p = BLOCK_PALETTES[pk]
                        const isCellMatch = cellColors[`${contextMenu.job.id}_${contextMenu.colId}`] === p.id
                        const isRowMatch = contextMenu.job.row_color === p.id
                        const isSelected = colorTargetScope === 'cell' ? isCellMatch : isRowMatch

                        return (
                          <button
                            key={p.id}
                            type="button"
                            onMouseDown={e => e.stopPropagation()}
                            onClick={e => {
                              e.stopPropagation()
                              if (colorTargetScope === 'cell') {
                                handleSetCellColor(contextMenu.job.id, contextMenu.colId, p.id)
                              } else {
                                handleSetSingleRowColor(contextMenu.rowIdx, p.id)
                              }
                            }}
                            style={{ backgroundColor: p.solidBg, borderColor: p.solidBorder }}
                            className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all cursor-pointer shadow-2xs hover:scale-110 relative ${
                              isSelected ? 'ring-2 ring-teal-500 ring-offset-2 scale-110 shadow-sm' : 'hover:border-slate-400'
                            }`}
                            title={`${p.name} (${colorPaletteTab === 'light' ? 'Light' : 'Solid'})`}
                          >
                            {isSelected && (
                              <Check
                                size={11}
                                className={p.isLight ? 'text-slate-900 stroke-[3]' : 'text-white stroke-[3]'}
                              />
                            )}
                          </button>
                        )
                      })}
                    </div>

                    <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
                      <span>{colorPaletteTab === 'light' ? '20 Light Colors' : '20 Solid Colors'}</span>
                      <button
                        type="button"
                        onMouseDown={e => e.stopPropagation()}
                        onClick={e => {
                          e.stopPropagation()
                          if (colorTargetScope === 'cell') {
                            handleResetCellColor(contextMenu.job.id, contextMenu.colId)
                          } else {
                            handleResetSingleRowColor(contextMenu.rowIdx)
                          }
                        }}
                        className="text-teal-700 hover:text-teal-900 underline font-semibold cursor-pointer"
                      >
                        Reset {colorTargetScope === 'cell' ? 'Cell Color' : 'Row Color'}
                      </button>
                    </div>
                  </div>
                )}

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

                {/* Delete Block (Only under Staff) & Delete Row */}
                <div className="py-0.5 border-t border-slate-100">
                  {isStaffSection && (
                    <button
                      type="button"
                      onClick={() => handleDeleteStaffBlock(contextMenu.job)}
                      className="w-full px-3.5 py-2 text-left hover:bg-rose-50 text-rose-700 flex items-center gap-2.5 font-bold transition-colors cursor-pointer"
                      title={`Delete entire staff block for ${contextMenu.job.staff_name || 'this cleaner'}`}
                    >
                      <Trash2 size={14} className="text-rose-600 shrink-0" />
                      <span>Delete Block ({contextMenu.job.staff_name || 'Staff Block'})</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      handleDeleteRow(contextMenu.rowIdx)
                      setContextMenu(null)
                    }}
                    className="w-full px-3.5 py-1.5 text-left hover:bg-slate-100 text-slate-600 flex items-center gap-2.5 font-medium transition-colors cursor-pointer"
                  >
                    <Trash2 size={14} className="text-slate-400 shrink-0" />
                    <span>Delete Row #{contextMenu.rowIdx + 1}</span>
                  </button>
                </div>
              </>
            )
          })()}
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
      {/* ── Spreadsheet Edit Entry Modal (Professional Pop-up) ── */}
      {editingRowState && (
        <SpreadsheetEditModal
          open={Boolean(editingRowState)}
          row={editingRowState.row}
          index={editingRowState.index}
          onClose={() => setEditingRowState(null)}
          onSave={handleSaveEditedRow}
          employees={employees}
          clients={clients}
          areaOptions={areaOptions}
        />
      )}

      {/* ── Quick New Client Modal (When Unregistered Client Entered) ── */}
      {quickClientState.open && (
        <QuickNewClientModal
          open={quickClientState.open}
          initialName={quickClientState.name}
          onClose={() => setQuickClientState({ open: false, rowIdx: null, name: '' })}
          onClientRegistered={(newClient) => {
            if (quickClientState.rowIdx !== null && quickClientState.rowIdx < gridRows.length) {
              const updated = [...gridRows]
              const row = { ...updated[quickClientState.rowIdx] }
              row.address = newClient.full_name || newClient.building_name || quickClientState.name
              if (newClient.area) row.area = newClient.area
              updated[quickClientState.rowIdx] = row
              pushState(updated)
            }
            setQuickClientState({ open: false, rowIdx: null, name: '' })
            showToast(`✓ Client "${newClient.full_name}" registered & assigned`)
          }}
        />
      )}

      {/* ── Dedicated Add Job Modal (From Header Button) ── */}
      {showAddJobModal && (
        <Modal
          open={showAddJobModal}
          onClose={() => setShowAddJobModal(false)}
          title="Add Job Entry"
          size="2xl"
          className="max-w-6xl w-full"
          headerActions={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAddJobModal(false)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-[12px] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="add-job-entry-form"
                className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-[12.5px] shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Plus size={15} className="stroke-[3]" />
                <span>Save</span>
              </button>
            </div>
          }
        >
          <div className="p-2">
            <AddJobForm
              employees={employees}
              clients={clients}
              initial={{ date: effectiveTargetDate, start_time: '09:00', end_time: '13:00', duty_hours: 4 }}
              existingJobsForDate={dailyJobs.filter(j => j.date === effectiveTargetDate)}
              onSave={jobData => {
                const newJob: DailyJob = {
                  ...jobData,
                  id: newRowId('new'),
                  created_at: new Date().toISOString()
                }
                const updated = [newJob, ...gridRows]
                pushState(updated)
                setShowAddJobModal(false)
                showToast(`✓ Job added for ${newJob.staff_name || 'Staff'}`)
              }}
              onClose={() => setShowAddJobModal(false)}
            />
          </div>
        </Modal>
      )}

      {/* ── Change Log History Audit Modal ── */}
      {showChangeLogModal && (
        <ChangeLogHistoryModal
          open={showChangeLogModal}
          onClose={() => setShowChangeLogModal(false)}
          selectedDate={effectiveTargetDate}
        />
      )}
    </div>
  )
}
