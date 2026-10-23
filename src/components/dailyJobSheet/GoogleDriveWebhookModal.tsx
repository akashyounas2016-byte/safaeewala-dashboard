import React, { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import {
  CloudUpload,
  CheckCircle,
  Copy,
  ExternalLink,
  FileSpreadsheet,
  Play,
  RefreshCw,
  AlertCircle,
  Sparkles,
  Layers,
  Code,
  HardDrive,
  Info
} from 'lucide-react'
import {
  getDriveWebhookUrl,
  setDriveWebhookUrl,
  testDriveWebhook,
  getN8nSampleWorkflowJson,
} from '@/lib/googleDrive'
import { fmtDate } from './jobSheetUtils'

interface GoogleDriveWebhookModalProps {
  open: boolean
  onClose: () => void
  selectedDate: string
  todayJobsCount: number
  onSendBackupNow: () => Promise<void>
  isUploading: boolean
  driveStatus: 'idle' | 'connecting' | 'uploading' | 'done' | 'error'
  driveLink: string
  driveError: string
}

export function GoogleDriveWebhookModal({
  open,
  onClose,
  selectedDate,
  todayJobsCount,
  onSendBackupNow,
  isUploading,
  driveStatus,
  driveLink,
  driveError,
}: GoogleDriveWebhookModalProps) {
  const [webhookUrl, setWebhookUrl] = useState('')
  const [activeTab, setActiveTab] = useState<'backup' | 'n8n_guide' | 'curl'>('backup')
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [copiedWorkflow, setCopiedWorkflow] = useState(false)
  const [copiedCurl, setCopiedCurl] = useState(false)
  const [savedSuccess, setSavedSuccess] = useState(false)

  useEffect(() => {
    if (open) {
      setWebhookUrl(getDriveWebhookUrl())
      setTestResult(null)
      setSavedSuccess(false)
    }
  }, [open])

  const handleSaveUrl = () => {
    setDriveWebhookUrl(webhookUrl)
    setSavedSuccess(true)
    setTimeout(() => setSavedSuccess(false), 2500)
  }

  const handleTestConnection = async () => {
    if (!webhookUrl) {
      setTestResult({ success: false, message: 'Please enter a webhook URL first.' })
      return
    }
    setIsTesting(true)
    setTestResult(null)
    try {
      const res = await testDriveWebhook(webhookUrl)
      setTestResult({ success: true, message: res.message })
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || 'Connection failed' })
    } finally {
      setIsTesting(false)
    }
  }

  const sampleCurl = `curl -X POST "${webhookUrl || 'https://n8n.yourdomain.com/webhook/safaeewala-gdrive'}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "event": "daily_job_sheet_backup",
    "date": "${selectedDate}",
    "filename": "DailyJobSheet-${selectedDate}.xlsx",
    "file_base64": "<BASE64_EXCEL_DATA>",
    "jobs_count": ${todayJobsCount}
  }'`

  const handleCopyWorkflow = () => {
    navigator.clipboard.writeText(getN8nSampleWorkflowJson())
    setCopiedWorkflow(true)
    setTimeout(() => setCopiedWorkflow(false), 2500)
  }

  const handleCopyCurl = () => {
    navigator.clipboard.writeText(sampleCurl)
    setCopiedCurl(true)
    setTimeout(() => setCopiedCurl(false), 2500)
  }

  return (
    <Modal open={open} onClose={onClose} title="Google Drive & n8n Automation" size="lg">
      <div className="space-y-4">
        {/* Header Hero Banner */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-600 via-sky-600 to-teal-600 text-white shadow-sm flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0 shadow-inner">
            <CloudUpload className="text-white" size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-bold text-[14.5px]">Automated Google Drive Backup</h4>
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-white/25 backdrop-blur-md">
                n8n & Webhooks
              </span>
            </div>
            <p className="text-[12px] text-blue-50 mt-1 leading-relaxed">
              Daily Job Sheets ko Excel format mein convert kar kay aap kay n8n Webhook kay zariye directly Google Drive folder mein backup karta hai.
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center border-b border-[#E4E8EC] gap-2 text-[12px] font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('backup')}
            className={`pb-2.5 px-3 flex items-center gap-1.5 border-b-2 transition-all cursor-pointer ${
              activeTab === 'backup'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <HardDrive size={14} />
            <span>Backup & Settings</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('n8n_guide')}
            className={`pb-2.5 px-3 flex items-center gap-1.5 border-b-2 transition-all cursor-pointer ${
              activeTab === 'n8n_guide'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Layers size={14} />
            <span>n8n Workflow Guide (1-Click)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('curl')}
            className={`pb-2.5 px-3 flex items-center gap-1.5 border-b-2 transition-all cursor-pointer ${
              activeTab === 'curl'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Code size={14} />
            <span>cURL & Schema</span>
          </button>
        </div>

        {/* Tab 1: Backup & Settings */}
        {activeTab === 'backup' && (
          <div className="space-y-4">
            {/* Input URL field */}
            <div className="space-y-1.5">
              <label className="block text-[11.5px] font-bold text-slate-700 uppercase tracking-wider">
                n8n Webhook URL (POST)
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={webhookUrl}
                  onChange={e => setWebhookUrl(e.target.value)}
                  placeholder="https://n8n.yourdomain.com/webhook/safaeewala-gdrive"
                  className="flex-1 px-3.5 py-2.5 text-[12.5px] border border-[#E4E8EC] rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all font-mono"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSaveUrl}
                  className="shrink-0"
                >
                  Save URL
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleTestConnection}
                  disabled={isTesting || !webhookUrl}
                  className="shrink-0 flex items-center gap-1.5"
                >
                  <Play size={13} className={isTesting ? 'animate-spin' : ''} />
                  <span>{isTesting ? 'Testing…' : 'Test Ping'}</span>
                </Button>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                <Info size={12} />
                <span>Agar webhook URL empty chhorain gay to sheet local VPS archive (<code className="text-slate-600">/data/backups/</code>) mein save hogi.</span>
              </p>
            </div>

            {/* Test result feedback */}
            {savedSuccess && (
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[12px] flex items-center gap-2">
                <CheckCircle size={14} className="text-emerald-600" />
                <span className="font-semibold">Webhook URL successfully saved to browser settings!</span>
              </div>
            )}
            {testResult && (
              <div className={`p-3 rounded-xl border text-[12px] flex items-center gap-2 ${
                testResult.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-red-50 border-red-200 text-red-700'
              }`}>
                {testResult.success ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
                <span className="font-semibold">{testResult.message}</span>
              </div>
            )}

            {/* Current Sheet Target Card */}
            <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/80 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    Current Sheet to Backup
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <FileSpreadsheet className="text-emerald-600" size={17} />
                    <span className="font-bold text-[13px] text-slate-800">
                      DailyJobSheet-{selectedDate}.xlsx
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[11px] font-medium text-slate-400 block">Date & Jobs</span>
                  <span className="text-[12px] font-bold text-slate-700">
                    {fmtDate(selectedDate)} ({todayJobsCount} jobs)
                  </span>
                </div>
              </div>

              {/* Status and Action */}
              <div className="pt-2 border-t border-slate-200 flex items-center justify-between flex-wrap gap-2">
                <div>
                  {driveStatus === 'uploading' && (
                    <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-blue-600">
                      <RefreshCw size={13} className="animate-spin" />
                      Sending to Google Drive via Webhook…
                    </span>
                  )}
                  {driveStatus === 'done' && (
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 text-[12px] font-bold text-emerald-700">
                        <CheckCircle size={14} /> Backup completed successfully!
                      </span>
                      {driveLink && (
                        <a
                          href={driveLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11.5px] font-bold text-blue-600 hover:underline flex items-center gap-1"
                        >
                          Open in Google Drive <ExternalLink size={11} />
                        </a>
                      )}
                    </div>
                  )}
                  {driveStatus === 'error' && (
                    <span className="inline-flex items-center gap-1 text-[12px] font-bold text-red-600">
                      <AlertCircle size={13} /> {driveError || 'Upload failed'}
                    </span>
                  )}
                  {driveStatus === 'idle' && (
                    <span className="text-[11.5px] text-slate-500 font-medium">
                      Ready to backup to Google Drive
                    </span>
                  )}
                </div>

                <Button
                  type="button"
                  onClick={onSendBackupNow}
                  disabled={isUploading}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-1.5"
                >
                  <CloudUpload size={14} className={isUploading ? 'animate-bounce' : ''} />
                  <span>{isUploading ? 'Backing Up…' : 'Send Backup Now'}</span>
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: n8n Workflow Guide */}
        {activeTab === 'n8n_guide' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-amber-500" />
                <span className="text-[12.5px] font-bold text-slate-800">
                  Ready-to-Use n8n Workflow (Import in 10 seconds)
                </span>
              </div>
              <button
                type="button"
                onClick={handleCopyWorkflow}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11.5px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {copiedWorkflow ? <CheckCircle size={13} /> : <Copy size={13} />}
                <span>{copiedWorkflow ? 'Copied to Clipboard!' : 'Copy n8n Workflow JSON'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1.5">
                <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-bold text-[11px] flex items-center justify-center">
                  1
                </div>
                <h5 className="font-bold text-[13px] text-slate-800">Webhook Node</h5>
                <p className="text-[11.5px] text-slate-500 leading-relaxed">
                  Method: <strong>POST</strong><br />
                  Path: <code className="text-blue-600 text-[10.5px]">/safaeewala-gdrive-backup</code><br />
                  Response: <strong>Using 'Respond to Webhook'</strong>
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1.5">
                <div className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 font-bold text-[11px] flex items-center justify-center">
                  2
                </div>
                <h5 className="font-bold text-[13px] text-slate-800">Code Node (Base64)</h5>
                <p className="text-[11.5px] text-slate-500 leading-relaxed">
                  CRM kay <code className="text-slate-700 font-semibold">file_base64</code> payload ko n8n binary <code className="text-slate-700 font-semibold">data</code> mein convert karta hai jo spreadsheet upload kay liye zaroori hai.
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1.5">
                <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 font-bold text-[11px] flex items-center justify-center">
                  3
                </div>
                <h5 className="font-bold text-[13px] text-slate-800">Google Drive Node</h5>
                <p className="text-[11.5px] text-slate-500 leading-relaxed">
                  Operation: <strong>Upload</strong><br />
                  Binary Property: <code className="text-emerald-700">data</code><br />
                  Folder: <em>Safaeewala Backups</em> (Google Drive)
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200 text-blue-950 space-y-2 text-[12px]">
              <strong className="block text-[12.5px] font-bold text-blue-900">How to use in n8n:</strong>
              <ol className="list-decimal pl-4 space-y-1 text-slate-700">
                <li>Upar majood <strong>"Copy n8n Workflow JSON"</strong> button par click karen.</li>
                <li>Apnay n8n editor screen par ja kar canvas par click karein aur <strong>Ctrl + V</strong> (Paste) dabayein.</li>
                <li>Poora 4-node workflow automatically create ho jaye ga.</li>
                <li>Google Drive node mein apna Google account connect karein aur workflow ko <strong>Active</strong> kar dein.</li>
                <li>Uski Webhook URL copy karke is modal kay <strong>"Backup & Settings"</strong> tab mein paste kar dein!</li>
              </ol>
            </div>
          </div>
        )}

        {/* Tab 3: cURL & Webhook Schema */}
        {activeTab === 'curl' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] font-bold text-slate-600 uppercase tracking-wider">
                Sample cURL Command
              </span>
              <button
                type="button"
                onClick={handleCopyCurl}
                className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
              >
                {copiedCurl ? <CheckCircle size={12} /> : <Copy size={12} />}
                <span>{copiedCurl ? 'Copied' : 'Copy cURL'}</span>
              </button>
            </div>
            <pre className="p-3.5 rounded-xl bg-slate-900 text-emerald-400 font-mono text-[11px] overflow-x-auto leading-relaxed border border-slate-800">
              {sampleCurl}
            </pre>

            <div className="text-[11.5px] text-slate-500 space-y-1 pt-1">
              <p><strong>Payload Fields sent by CRM:</strong></p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li><code className="text-slate-800 font-bold">event</code>: "daily_job_sheet_backup"</li>
                <li><code className="text-slate-800 font-bold">date</code>: Current sheet date (e.g. {selectedDate})</li>
                <li><code className="text-slate-800 font-bold">filename</code>: DailyJobSheet-{selectedDate}.xlsx</li>
                <li><code className="text-slate-800 font-bold">file_base64</code>: Complete Base64-encoded Excel file (.xlsx)</li>
                <li><code className="text-slate-800 font-bold">summary</code>: Object with total charges, gross collected, net total, expenses</li>
                <li><code className="text-slate-800 font-bold">jobs</code>: Array of all individual shifts and cleaner assignments</li>
              </ul>
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div className="pt-3 border-t border-[#E4E8EC] flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  )
}
