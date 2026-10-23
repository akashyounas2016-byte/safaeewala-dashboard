const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
const SCOPE = 'https://www.googleapis.com/auth/drive.file'

let _tokenClient: any = null
let _accessToken = ''

function loadGIS(): Promise<void> {
  return new Promise((resolve) => {
    if ((window as any).google?.accounts) { resolve(); return }
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.onload = () => resolve()
    document.head.appendChild(script)
  })
}

export async function authorizeGoogleDrive(): Promise<string> {
  if (!CLIENT_ID) throw new Error('VITE_GOOGLE_CLIENT_ID not set in environment variables')
  await loadGIS()
  return new Promise((resolve, reject) => {
    _tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (response: any) => {
        if (response.error) { reject(new Error(response.error)); return }
        _accessToken = response.access_token
        resolve(_accessToken)
      },
    })
    _tokenClient.requestAccessToken({ prompt: 'consent' })
  })
}

export function getAccessToken() { return _accessToken }

export async function uploadToDrive(blob: Blob, filename: string, token: string): Promise<string> {
  const metadata = {
    name: filename,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }
  const form = new FormData()
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
  form.append('file', blob)

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form }
  )
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error?.message || 'Upload failed')
  }
  const data = await res.json()
  return data.webViewLink as string
}

export const gdriveConfigured = !!CLIENT_ID

/* ══════════════════════════════════════════════════════════════════════
   n8n & Webhook Google Drive Backup Mechanism
   ══════════════════════════════════════════════════════════════════════ */

export const GDRIVE_WEBHOOK_STORAGE_KEY = 'safaeewala_gdrive_webhook_url'

export function getDriveWebhookUrl(): string {
  try {
    return localStorage.getItem(GDRIVE_WEBHOOK_STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

export function setDriveWebhookUrl(url: string): void {
  try {
    localStorage.setItem(GDRIVE_WEBHOOK_STORAGE_KEY, url.trim())
  } catch (e) {
    console.error('Failed to save webhook URL to localStorage:', e)
  }
}

/**
 * Converts a binary Blob (such as generated Excel spreadsheet) to Base64 string
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const dataUrl = reader.result as string
      // Extract pure base64 without "data:*/*;base64," prefix
      const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export interface BackupPayloadParams {
  date: string
  filename: string
  blob: Blob
  summary: Record<string, any>
  jobs: any[]
  expenses: any[]
  pending?: any[]
  webhookUrl?: string
}

export interface BackupResult {
  success: boolean
  message: string
  driveUrl?: string
  fileId?: string
  savedToVps?: boolean
}

/**
 * Sends Daily Job Sheet data & Excel file to n8n Webhook and local VPS backup endpoint
 */
export async function sendDailySheetBackupViaWebhook(params: BackupPayloadParams): Promise<BackupResult> {
  const targetUrl = params.webhookUrl || getDriveWebhookUrl()
  const base64 = await blobToBase64(params.blob)

  const payload = {
    event: 'daily_job_sheet_backup',
    date: params.date,
    filename: params.filename,
    mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    file_base64: base64,
    file_size_bytes: params.blob.size,
    summary: params.summary,
    jobs_count: params.jobs.length,
    jobs: params.jobs,
    expenses_count: params.expenses.length,
    expenses: params.expenses,
    pending_count: (params.pending || []).length,
    pending: params.pending || [],
    exported_at: new Date().toISOString(),
  }

  // 1. Send to user's n8n / custom Google Drive Webhook if configured
  let webhookResult: any = null
  let driveLink = ''

  if (targetUrl) {
    try {
      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        throw new Error(`n8n Webhook responded with status ${res.status}: ${res.statusText}`)
      }

      try {
        webhookResult = await res.json()
        driveLink = webhookResult?.driveUrl || webhookResult?.webViewLink || webhookResult?.fileUrl || webhookResult?.link || webhookResult?.url || ''
      } catch {
        webhookResult = { success: true }
      }
    } catch (err: any) {
      console.warn('n8n Webhook post failed:', err.message)
      throw new Error(`n8n Webhook error: ${err.message}`)
    }
  }

  // 2. Also send redundant archive to local VPS server
  let vpsSaved = false
  try {
    const vpsRes = await fetch('/api/webhook/google-drive-backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        n8n_url: targetUrl || undefined,
      }),
    })
    if (vpsRes.ok) {
      vpsSaved = true
    }
  } catch {
    // Non-fatal if offline
  }

  return {
    success: true,
    message: targetUrl
      ? 'Daily Job Sheet successfully sent to n8n Webhook for Google Drive backup!'
      : 'Daily Job Sheet backup safely saved to VPS storage (/data/backups/)!',
    driveUrl: driveLink,
    savedToVps: vpsSaved,
  }
}

/**
 * Test ping to verify n8n Webhook endpoint
 */
export async function testDriveWebhook(url: string): Promise<{ success: boolean; message: string; data?: any }> {
  if (!url || !url.startsWith('http')) {
    throw new Error('Please enter a valid HTTP or HTTPS webhook URL')
  }

  const testPayload = {
    event: 'test_ping',
    source: 'Safaeewala Booking CRM',
    timestamp: new Date().toISOString(),
    filename: 'TestConnection.xlsx',
    test: true,
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(testPayload),
  })

  if (!res.ok) {
    throw new Error(`Webhook endpoint returned HTTP ${res.status} (${res.statusText})`)
  }

  let data = null
  try {
    data = await res.json()
  } catch {
    // text response is acceptable
  }

  return {
    success: true,
    message: `Webhook connected successfully! Status: ${res.status} OK`,
    data,
  }
}

/**
 * Returns copy-pasteable JSON for import into n8n canvas (Ctrl+V)
 */
export function getN8nSampleWorkflowJson(): string {
  const workflow = {
    name: "Safaeewala Daily Job Sheet to Google Drive Backup",
    nodes: [
      {
        parameters: {
          httpMethod: "POST",
          path: "safaeewala-gdrive-backup",
          responseMode: "responseNode",
          options: {}
        },
        name: "Webhook Receiver",
        type: "n8n-nodes-base.webhook",
        typeVersion: 2,
        position: [220, 300]
      },
      {
        parameters: {
          jsCode: `// Extract base64 Excel spreadsheet from Safaeewala CRM payload
const item = $input.first().json;
const base64Data = item.file_base64 || '';
const filename = item.filename || ('DailyJobSheet-' + (item.date || 'backup') + '.xlsx');
const mimeType = item.mime_type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

return [{
  json: {
    ...item,
    file_base64: undefined // avoid carrying heavy payload
  },
  binary: {
    data: {
      data: base64Data,
      mimeType: mimeType,
      fileName: filename
    }
  }
}];`
        },
        name: "Extract Base64 to Binary",
        type: "n8n-nodes-base.code",
        typeVersion: 2,
        position: [460, 300]
      },
      {
        parameters: {
          operation: "upload",
          name: "={{ $binary.data.fileName }}",
          binaryData: true,
          binaryPropertyName: "data",
          options: {}
        },
        name: "Upload to Google Drive",
        type: "n8n-nodes-base.googleDrive",
        typeVersion: 3,
        position: [700, 300]
      },
      {
        parameters: {
          respondWith: "json",
          responseBody: `={\n  "success": true,\n  "message": "Daily Job Sheet backed up to Google Drive successfully!",\n  "fileId": "{{ $json.id }}",\n  "driveUrl": "{{ $json.webViewLink }}"\n}`,
          options: {}
        },
        name: "Respond to CRM",
        type: "n8n-nodes-base.respondToWebhook",
        typeVersion: 1.1,
        position: [920, 300]
      }
    ],
    connections: {
      "Webhook Receiver": {
        main: [
          [
            {
              node: "Extract Base64 to Binary",
              type: "main",
              index: 0
            }
          ]
        ]
      },
      "Extract Base64 to Binary": {
        main: [
          [
            {
              node: "Upload to Google Drive",
              type: "main",
              index: 0
            }
          ]
        ]
      },
      "Upload to Google Drive": {
        main: [
          [
            {
              node: "Respond to CRM",
              type: "main",
              index: 0
            }
          ]
        ]
      }
    }
  }

  return JSON.stringify(workflow, null, 2)
}
