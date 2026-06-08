import { useState } from 'react'
import { Send, MessageSquare, Plus, Trash2, Edit2, Save, Bell, CheckCircle, AlertCircle } from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'
import { Button } from '@/components/ui/Button'
import { Input, Textarea, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'

interface SMSTemplate {
  id: string
  name: string
  trigger: 'manual' | 'appointment_24h' | 'appointment_2h' | 'completion' | 'payment'
  message: string
  variables: string[]
}

interface SMSMessage {
  id: string
  templateId: string
  recipient: string
  recipientType: 'client' | 'crew'
  status: 'pending' | 'sent' | 'failed' | 'delivered'
  sentAt: string
  message: string
  cost: number
}

const defaultTemplates: SMSTemplate[] = [
  {
    id: '1',
    name: '24h Appointment Reminder',
    trigger: 'appointment_24h',
    message: 'Hi {clientName}, reminder: Your {serviceType} cleaning is scheduled for tomorrow at {time}. Call us at +971 55 628 2374 to reschedule.',
    variables: ['clientName', 'serviceType', 'time'],
  },
  {
    id: '2',
    name: '2h Appointment Reminder',
    trigger: 'appointment_2h',
    message: 'Hi {clientName}, our team will arrive in 2 hours for your {serviceType} cleaning. Please ensure the property is accessible.',
    variables: ['clientName', 'serviceType'],
  },
  {
    id: '3',
    name: 'Job Completion',
    trigger: 'completion',
    message: 'Hi {clientName}, your {serviceType} is complete! Rate your experience: {reviewLink}',
    variables: ['clientName', 'serviceType', 'reviewLink'],
  },
  {
    id: '4',
    name: 'Payment Reminder',
    trigger: 'payment',
    message: 'Hi {clientName}, your invoice {invoiceId} is due on {dueDate}. Pay online: {paymentLink}',
    variables: ['clientName', 'invoiceId', 'dueDate', 'paymentLink'],
  },
]

const defaultMessages: SMSMessage[] = [
  {
    id: '1',
    templateId: '1',
    recipient: '+971501234567',
    recipientType: 'client',
    status: 'delivered',
    sentAt: '2026-06-07 14:30',
    message: 'Hi Ahmed, reminder: Your villa cleaning is scheduled for tomorrow at 10:00 AM.',
    cost: 0.18,
  },
  {
    id: '2',
    templateId: '2',
    recipient: '+971509876543',
    recipientType: 'client',
    status: 'sent',
    sentAt: '2026-06-07 08:00',
    message: 'Hi Fatima, our team will arrive in 2 hours for your office cleaning.',
    cost: 0.18,
  },
  {
    id: '3',
    templateId: '3',
    recipient: '+971505555555',
    recipientType: 'crew',
    status: 'delivered',
    sentAt: '2026-06-06 16:45',
    message: 'Job #123 at Villa Al Mansoori is complete!',
    cost: 0.18,
  },
]

export function SMSNotifications() {
  const [templates, setTemplates] = useState<SMSTemplate[]>(defaultTemplates)
  const [messages, setMessages] = useState<SMSMessage[]>(defaultMessages)
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [showSendModal, setShowSendModal] = useState(false)
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)
  const [templateForm, setTemplateForm] = useState<SMSTemplate>({
    id: '',
    name: '',
    trigger: 'manual',
    message: '',
    variables: [],
  })
  const [sendForm, setSendForm] = useState({
    templateId: '',
    recipient: '',
    recipientType: 'client' as 'client' | 'crew',
    customMessage: '',
  })

  const handleAddTemplate = () => {
    setTemplateForm({
      id: Date.now().toString(),
      name: '',
      trigger: 'manual',
      message: '',
      variables: [],
    })
    setEditingTemplateId(null)
    setShowTemplateModal(true)
  }

  const handleSaveTemplate = () => {
    if (!templateForm.name || !templateForm.message) {
      alert('Please fill all required fields')
      return
    }

    // Extract variables from message
    const variableMatches = templateForm.message.match(/{(\w+)}/g) || []
    const variables = variableMatches.map(m => m.slice(1, -1))

    const updatedTemplate = { ...templateForm, variables }

    if (editingTemplateId) {
      setTemplates(t => t.map(x => x.id === editingTemplateId ? updatedTemplate : x))
    } else {
      setTemplates(t => [...t, updatedTemplate])
    }
    setShowTemplateModal(false)
  }

  const handleDeleteTemplate = (id: string) => {
    setTemplates(t => t.filter(x => x.id !== id))
  }

  const handleSendSMS = () => {
    if (!sendForm.templateId && !sendForm.customMessage) {
      alert('Select a template or enter a custom message')
      return
    }

    const selectedTemplate = templates.find(t => t.id === sendForm.templateId)
    const messageText = sendForm.customMessage || selectedTemplate?.message || ''

    const newMessage: SMSMessage = {
      id: Date.now().toString(),
      templateId: sendForm.templateId,
      recipient: sendForm.recipient,
      recipientType: sendForm.recipientType,
      status: 'sent',
      sentAt: new Date().toLocaleString('en-AE'),
      message: messageText,
      cost: 0.18,
    }

    setMessages(m => [newMessage, ...m])
    setShowSendModal(false)
    setSendForm({
      templateId: '',
      recipient: '',
      recipientType: 'client',
      customMessage: '',
    })
  }

  const stats = {
    totalSent: messages.length,
    delivered: messages.filter(m => m.status === 'delivered').length,
    failed: messages.filter(m => m.status === 'failed').length,
    totalCost: messages.reduce((sum, m) => sum + m.cost, 0),
    deliveryRate: messages.length > 0 ? Math.round((messages.filter(m => m.status === 'delivered').length / messages.length) * 100) : 0,
  }

  return (
    <div className="space-y-6">
      <PageHero
        title="SMS Notifications"
        subtitle="Send automated appointment reminders and alerts"
        actionLabel="+ Send SMS"
        onAction={() => setShowSendModal(true)}
      />

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-blue-50 border border-blue-200 rounded-[16px] p-5">
          <p className="text-[12px] font-semibold text-blue-700 uppercase">Total Sent</p>
          <p className="text-[28px] font-bold text-blue-900 mt-1">{stats.totalSent}</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-[16px] p-5">
          <p className="text-[12px] font-semibold text-emerald-700 uppercase">Delivered</p>
          <p className="text-[28px] font-bold text-emerald-900 mt-1">{stats.delivered}</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-[16px] p-5">
          <p className="text-[12px] font-semibold text-red-700 uppercase">Failed</p>
          <p className="text-[28px] font-bold text-red-900 mt-1">{stats.failed}</p>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-[16px] p-5">
          <p className="text-[12px] font-semibold text-purple-700 uppercase">Delivery Rate</p>
          <p className="text-[28px] font-bold text-purple-900 mt-1">{stats.deliveryRate}%</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-[16px] p-5">
          <p className="text-[12px] font-semibold text-slate-700 uppercase">Total Cost</p>
          <p className="text-[24px] font-bold text-slate-900 mt-1">AED {stats.totalCost.toFixed(2)}</p>
        </div>
      </div>

      {/* Info */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-[22px] p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center shrink-0">
            <MessageSquare size={20} className="text-white" />
          </div>
          <div className="flex-1">
            <p className="text-[14px] font-bold text-blue-900 mb-2">SMS Integration Status</p>
            <p className="text-[12px] text-blue-800 mb-3">
              ✅ Dashboard ready • 🔄 Integration pending • 💰 Cost: ~AED 0.18 per SMS
            </p>
            <p className="text-[11px] text-blue-700">
              <strong>To activate:</strong> Set up Twilio account (SMS gateway) and add API credentials to VPS environment
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-[#E4E8EC] pb-4">
        <button className="text-[14px] font-semibold text-emerald-600 border-b-2 border-emerald-600 pb-2">
          Messages
        </button>
        <button
          onClick={() => setShowTemplateModal(true)}
          className="text-[14px] font-semibold text-slate-600 hover:text-slate-800 pb-2"
        >
          Templates
        </button>
      </div>

      {/* Messages Table */}
      <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E4E8EC]">
          <h3 className="text-[15px] font-bold text-[#111827]">Recent Messages</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E4E8EC] bg-slate-50">
                <th className="px-6 py-4 text-left text-[12px] font-bold text-slate-600 uppercase">Recipient</th>
                <th className="px-6 py-4 text-left text-[12px] font-bold text-slate-600 uppercase">Type</th>
                <th className="px-6 py-4 text-left text-[12px] font-bold text-slate-600 uppercase">Message</th>
                <th className="px-6 py-4 text-center text-[12px] font-bold text-slate-600 uppercase">Status</th>
                <th className="px-6 py-4 text-left text-[12px] font-bold text-slate-600 uppercase">Sent At</th>
              </tr>
            </thead>
            <tbody>
              {messages.map(msg => (
                <tr key={msg.id} className="border-b border-[#E4E8EC] hover:bg-slate-50">
                  <td className="px-6 py-4 text-[13px] font-semibold text-[#111827]">{msg.recipient}</td>
                  <td className="px-6 py-4">
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 capitalize">
                      {msg.recipientType}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-[12px] text-slate-600 max-w-xs truncate">{msg.message}</td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {msg.status === 'delivered' && (
                        <>
                          <CheckCircle size={14} className="text-emerald-600" />
                          <span className="text-[11px] font-bold text-emerald-600">Delivered</span>
                        </>
                      )}
                      {msg.status === 'sent' && (
                        <>
                          <Bell size={14} className="text-blue-600" />
                          <span className="text-[11px] font-bold text-blue-600">Sent</span>
                        </>
                      )}
                      {msg.status === 'failed' && (
                        <>
                          <AlertCircle size={14} className="text-red-600" />
                          <span className="text-[11px] font-bold text-red-600">Failed</span>
                        </>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-[12px] text-slate-600">{msg.sentAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Templates Preview */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[16px] font-bold text-[#111827]">Message Templates</h3>
          <Button onClick={handleAddTemplate} size="sm">
            <Plus size={14} className="mr-1.5" /> New Template
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map(template => (
            <div
              key={template.id}
              className="bg-white rounded-[16px] border border-[#E4E8EC] p-4 hover:border-slate-300 transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-[13px] font-bold text-[#111827]">{template.name}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5 capitalize">{template.trigger.replace('_', ' ')}</p>
                </div>
                <button
                  onClick={() => handleDeleteTemplate(template.id)}
                  className="p-1.5 rounded-lg hover:bg-red-100 text-red-600 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <p className="text-[12px] text-slate-600 bg-slate-50 p-3 rounded-lg line-clamp-3">{template.message}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Send SMS Modal */}
      <Modal
        open={showSendModal}
        onClose={() => setShowSendModal(false)}
        title="Send SMS"
        size="lg"
      >
        <div className="space-y-4">
          <Select
            label="Send To (Type)"
            value={sendForm.recipientType}
            onChange={e => setSendForm({ ...sendForm, recipientType: e.target.value as 'client' | 'crew' })}
          >
            <option value="client">Client</option>
            <option value="crew">Crew Member</option>
          </Select>

          <Input
            label="Phone Number"
            value={sendForm.recipient}
            onChange={e => setSendForm({ ...sendForm, recipient: e.target.value })}
            placeholder="+971501234567"
            required
          />

          <Select
            label="Use Template (Optional)"
            value={sendForm.templateId}
            onChange={e => setSendForm({ ...sendForm, templateId: e.target.value })}
          >
            <option value="">-- Custom Message --</option>
            {templates.map(t => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>

          {!sendForm.templateId && (
            <Textarea
              label="Message"
              value={sendForm.customMessage}
              onChange={e => setSendForm({ ...sendForm, customMessage: e.target.value })}
              placeholder="Enter your SMS message (max 160 characters)"
              rows={3}
            />
          )}

          {sendForm.templateId && (
            <div>
              <label className="text-[13px] font-semibold text-[#111827] block mb-2">Preview</label>
              <div className="bg-slate-50 rounded-xl p-4 text-[12px] text-slate-700">
                {templates.find(t => t.id === sendForm.templateId)?.message}
              </div>
            </div>
          )}

          <div className="bg-blue-50 rounded-xl p-3">
            <p className="text-[11px] text-blue-800">
              💰 Cost: <strong>AED 0.18</strong> per SMS
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowSendModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleSendSMS}>
              <Send size={14} className="mr-1.5" /> Send SMS
            </Button>
          </div>
        </div>
      </Modal>

      {/* Template Modal */}
      <Modal
        open={showTemplateModal}
        onClose={() => setShowTemplateModal(false)}
        title={editingTemplateId ? 'Edit Template' : 'New Template'}
        size="lg"
      >
        <div className="space-y-4">
          <Input
            label="Template Name"
            value={templateForm.name}
            onChange={e => setTemplateForm({ ...templateForm, name: e.target.value })}
            placeholder="e.g., 24h Appointment Reminder"
            required
          />

          <Select
            label="Trigger"
            value={templateForm.trigger}
            onChange={e => setTemplateForm({ ...templateForm, trigger: e.target.value as any })}
          >
            <option value="manual">Manual Send</option>
            <option value="appointment_24h">24h Before Appointment</option>
            <option value="appointment_2h">2h Before Appointment</option>
            <option value="completion">Job Completion</option>
            <option value="payment">Payment Reminder</option>
          </Select>

          <Textarea
            label="Message"
            value={templateForm.message}
            onChange={e => setTemplateForm({ ...templateForm, message: e.target.value })}
            placeholder="Enter message. Use {variableName} for dynamic fields, e.g., {clientName}, {time}"
            rows={4}
            required
          />

          <div className="bg-amber-50 rounded-xl p-3">
            <p className="text-[11px] text-amber-800 font-semibold mb-2">Available Variables:</p>
            <p className="text-[11px] text-amber-700">
              {'{clientName}'}, {'{crewName}'}, {'{serviceType}'}, {'{time}'}, {'{date}'}, {'{invoiceId>'}, {'{dueDate>'}, {'{reviewLink>'}, {'{paymentLink>'}
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowTemplateModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveTemplate}>
              <Save size={14} className="mr-1.5" /> Save Template
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
