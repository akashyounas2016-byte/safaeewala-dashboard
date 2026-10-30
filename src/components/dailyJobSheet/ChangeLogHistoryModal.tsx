import React, { useState, useEffect, useMemo } from 'react'
import { Modal } from '@/components/ui/Modal'
import { History, User, Clock, Search, RotateCcw, X, Shield, ArrowRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fmtDate } from './jobSheetUtils'

export interface AuditEntry {
  id: string
  created_at: string
  user_name: string | null
  action: string
  entity: string
  entity_id: string
  entity_name: string | null
  details: string | null
}

interface ChangeLogHistoryModalProps {
  open: boolean
  onClose: () => void
  selectedDate?: string
}

export function ChangeLogHistoryModal({
  open,
  onClose,
  selectedDate,
}: ChangeLogHistoryModalProps) {
  const [logs, setLogs] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [filterAction, setFilterAction] = useState<'ALL' | 'INSERT' | 'UPDATE' | 'DELETE'>('ALL')

  const fetchLogs = async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200)

      const { data, error } = await query
      if (!error && data) {
        setLogs(data as AuditEntry[])
      } else {
        setLogs([])
      }
    } catch {
      setLogs([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) {
      void fetchLogs()
    }
  }, [open, selectedDate])

  const filteredLogs = useMemo(() => {
    let list = logs

    if (filterAction !== 'ALL') {
      list = list.filter(l => l.action?.toUpperCase() === filterAction)
    }

    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(l =>
        (l.user_name || '').toLowerCase().includes(q) ||
        (l.entity_name || '').toLowerCase().includes(q) ||
        (l.details || '').toLowerCase().includes(q) ||
        (l.action || '').toLowerCase().includes(q) ||
        (l.created_at || '').toLowerCase().includes(q)
      )
    }

    return list
  }, [logs, filterAction, search])

  const formatTimestamp = (iso: string) => {
    try {
      const d = new Date(iso)
      return d.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
    } catch {
      return iso
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Change Log History"
      size="2xl"
      className="max-w-5xl w-full"
      headerActions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchLogs}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-[12px] transition-colors cursor-pointer"
            title="Refresh logs"
          >
            <RotateCcw size={13} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-[12px] transition-colors cursor-pointer shadow-xs"
          >
            Close
          </button>
        </div>
      }
    >
      <div className="space-y-4 text-slate-800">
        {/* Subtitle / Description */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div>
            <h4 className="text-[14px] font-bold text-slate-900 flex items-center gap-2">
              <History size={16} className="text-emerald-600" />
              <span>Full Spreadsheet Audit Trail & Change Records</span>
            </h4>
            <p className="text-[12px] text-slate-500 mt-0.5">
              Chronological log of changes, including user identity, role, field modifications, and timestamps.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[12px] font-semibold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
            <span>Total Logged Entries:</span>
            <span className="font-black text-slate-900">{filteredLogs.length}</span>
          </div>
        </div>

        {/* Search & Action Filters Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by user, cleaner, changes..."
              className="w-full pl-9 pr-7 py-2 text-[12.5px] border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:border-emerald-600 font-medium"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 text-[11.5px] font-bold">
            {(['ALL', 'UPDATE', 'INSERT', 'DELETE'] as const).map(act => (
              <button
                key={act}
                type="button"
                onClick={() => setFilterAction(act)}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  filterAction === act
                    ? 'bg-white text-slate-900 shadow-xs font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {act === 'ALL' ? 'All Actions' : act}
              </button>
            ))}
          </div>
        </div>

        {/* Change Log Table */}
        <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="py-16 text-center text-slate-400 text-[13px] font-medium">
              <RotateCcw size={24} className="animate-spin mx-auto mb-2 text-emerald-600" />
              Loading change history…
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <History size={32} className="mx-auto mb-2 text-slate-300" />
              <div className="font-bold text-[13px] text-slate-600">No Change Records Found</div>
              <p className="text-[11.5px] mt-1 max-w-sm mx-auto">
                {search ? `No log entries matched "${search}".` : 'No audit changes have been recorded for spreadsheet records yet.'}
              </p>
            </div>
          ) : (
            <table className="w-full text-[12px] border-collapse text-left">
              <thead className="sticky top-0 bg-slate-100/95 backdrop-blur-xs border-b border-slate-200 font-bold text-slate-700 text-[11px] uppercase tracking-wider z-10">
                <tr>
                  <th className="px-3.5 py-2.5">Timestamp</th>
                  <th className="px-3.5 py-2.5">User & Role</th>
                  <th className="px-3.5 py-2.5">Action</th>
                  <th className="px-3.5 py-2.5">Target Record</th>
                  <th className="px-3.5 py-2.5">Change Details (Diff)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredLogs.map(log => {
                  const actionUpper = (log.action || 'UPDATE').toUpperCase()
                  const isInsert = actionUpper === 'INSERT'
                  const isDelete = actionUpper === 'DELETE'

                  return (
                    <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Timestamp */}
                      <td className="px-3.5 py-2.5 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Clock size={12} className="text-slate-400 shrink-0" />
                          <span>{formatTimestamp(log.created_at)}</span>
                        </div>
                      </td>

                      {/* User & Role */}
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 font-extrabold flex items-center justify-center text-[10px] shrink-0">
                            {(log.user_name || 'Admin')[0].toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 text-[12px] leading-tight">
                              {log.user_name || 'System Admin'}
                            </div>
                            <div className="text-[10px] font-semibold text-slate-400 flex items-center gap-1">
                              <Shield size={10} className="text-emerald-600" />
                              <span>Administrator / Staff</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Action Badge */}
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${
                          isInsert
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : isDelete
                              ? 'bg-rose-50 text-rose-800 border-rose-200'
                              : 'bg-blue-50 text-blue-800 border-blue-200'
                        }`}>
                          {log.action || 'UPDATE'}
                        </span>
                      </td>

                      {/* Target Record */}
                      <td className="px-3.5 py-2.5 font-bold text-slate-800 whitespace-nowrap">
                        {log.entity_name || log.entity_id || 'Job Shift'}
                      </td>

                      {/* Details / Diff */}
                      <td className="px-3.5 py-2.5 font-medium text-slate-700 max-w-md">
                        {log.details ? (
                          <div className="font-mono text-[11.5px] bg-slate-50 p-1.5 rounded-lg border border-slate-200/80 break-words whitespace-pre-wrap">
                            {log.details}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">No specific field changes recorded</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Modal>
  )
}

