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
