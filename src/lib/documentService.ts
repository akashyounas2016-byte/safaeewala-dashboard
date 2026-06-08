// Document Management Service
// Handles document upload, storage, signatures, and compliance tracking

export interface DocumentMetadata {
  id: string
  name: string
  type: 'contract' | 'agreement' | 'certification' | 'compliance' | 'financial' | 'other'
  category: 'client' | 'employee' | 'company' | 'legal'
  linkedTo?: string
  uploadDate: string
  expirationDate?: string
  fileSize: number
  mimeType: string
  storageUrl?: string
}

export interface DocumentSignature {
  documentId: string
  signedBy: string
  signedDate: string
  signatureImage?: string
  ipAddress?: string
  userAgent?: string
}

export interface DocumentAccessLog {
  documentId: string
  user: string
  action: 'viewed' | 'downloaded' | 'signed' | 'shared'
  timestamp: string
  ipAddress?: string
}

/**
 * Upload document to secure storage
 * Supports: PDF, DOCX, XLSX, images, etc.
 */
export async function uploadDocument(
  file: File,
  metadata: Omit<DocumentMetadata, 'uploadDate' | 'fileSize'>
): Promise<DocumentMetadata> {
  try {
    // Validate file
    const maxSize = 50 * 1024 * 1024 // 50MB
    if (file.size > maxSize) {
      throw new Error('File too large (max 50MB)')
    }

    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/png',
    ]

    if (!allowedTypes.includes(file.type)) {
      throw new Error('Invalid file type')
    }

    // Upload to backend/cloud storage
    const formData = new FormData()
    formData.append('file', file)
    formData.append('metadata', JSON.stringify(metadata))

    const response = await fetch('/api/documents/upload', {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      throw new Error('Upload failed')
    }

    const result = await response.json()
    return {
      ...metadata,
      id: result.documentId,
      uploadDate: new Date().toISOString().split('T')[0],
      fileSize: file.size,
      mimeType: file.type,
      storageUrl: result.storageUrl,
    }
  } catch (error) {
    console.error('Document upload error:', error)
    throw error
  }
}

/**
 * Get document by ID with access logging
 */
export async function getDocument(documentId: string): Promise<DocumentMetadata> {
  try {
    const response = await fetch(`/api/documents/${documentId}`)
    if (!response.ok) throw new Error('Document not found')

    // Log access
    logDocumentAccess(documentId, 'viewed')

    return await response.json()
  } catch (error) {
    console.error('Get document error:', error)
    throw error
  }
}

/**
 * Download document
 */
export async function downloadDocument(documentId: string): Promise<Blob> {
  try {
    const response = await fetch(`/api/documents/${documentId}/download`)
    if (!response.ok) throw new Error('Download failed')

    // Log access
    logDocumentAccess(documentId, 'downloaded')

    return await response.blob()
  } catch (error) {
    console.error('Download error:', error)
    throw error
  }
}

/**
 * Sign document with digital signature
 */
export async function signDocument(
  documentId: string,
  signedBy: string,
  signatureData?: string
): Promise<DocumentSignature> {
  try {
    const response = await fetch(`/api/documents/${documentId}/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signedBy,
        signatureImage: signatureData,
      }),
    })

    if (!response.ok) throw new Error('Signature failed')

    const signature = await response.json()

    // Log access
    logDocumentAccess(documentId, 'signed')

    return signature
  } catch (error) {
    console.error('Sign document error:', error)
    throw error
  }
}

/**
 * Delete document
 */
export async function deleteDocument(documentId: string): Promise<void> {
  try {
    const response = await fetch(`/api/documents/${documentId}`, {
      method: 'DELETE',
    })

    if (!response.ok) throw new Error('Delete failed')
  } catch (error) {
    console.error('Delete error:', error)
    throw error
  }
}

/**
 * Get documents by category or client/employee
 */
export async function getDocuments(filters?: {
  category?: string
  linkedTo?: string
  type?: string
}): Promise<DocumentMetadata[]> {
  try {
    const query = new URLSearchParams()
    if (filters?.category) query.append('category', filters.category)
    if (filters?.linkedTo) query.append('linkedTo', filters.linkedTo)
    if (filters?.type) query.append('type', filters.type)

    const response = await fetch(`/api/documents?${query}`)
    if (!response.ok) throw new Error('Failed to fetch documents')

    return await response.json()
  } catch (error) {
    console.error('Get documents error:', error)
    return []
  }
}

/**
 * Get documents expiring within N days
 */
export async function getExpiringDocuments(daysUntilExpiry: number = 30): Promise<DocumentMetadata[]> {
  try {
    const response = await fetch(`/api/documents/expiring?days=${daysUntilExpiry}`)
    if (!response.ok) throw new Error('Failed to fetch expiring documents')

    return await response.json()
  } catch (error) {
    console.error('Get expiring documents error:', error)
    return []
  }
}

/**
 * Get document access log
 */
export async function getAccessLog(documentId: string): Promise<DocumentAccessLog[]> {
  try {
    const response = await fetch(`/api/documents/${documentId}/access-log`)
    if (!response.ok) throw new Error('Failed to fetch access log')

    return await response.json()
  } catch (error) {
    console.error('Get access log error:', error)
    return []
  }
}

/**
 * Log document access (internal)
 */
function logDocumentAccess(
  documentId: string,
  action: 'viewed' | 'downloaded' | 'signed' | 'shared'
): void {
  fetch('/api/documents/access-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      documentId,
      action,
      timestamp: new Date().toISOString(),
    }),
  }).catch(err => console.error('Failed to log access:', err))
}

/**
 * Share document with user/client
 */
export async function shareDocument(
  documentId: string,
  shareWith: string,
  expiresIn?: number // days
): Promise<{ shareLink: string; expiresAt?: string }> {
  try {
    const response = await fetch(`/api/documents/${documentId}/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shareWith,
        expiresIn,
      }),
    })

    if (!response.ok) throw new Error('Share failed')

    // Log access
    logDocumentAccess(documentId, 'shared')

    return await response.json()
  } catch (error) {
    console.error('Share document error:', error)
    throw error
  }
}

/**
 * Get compliance status for company documents
 */
export async function getComplianceStatus(): Promise<{
  allCompliant: boolean
  expired: number
  expiringSoon: number
  active: number
  documents: DocumentMetadata[]
}> {
  try {
    const response = await fetch('/api/documents/compliance-status')
    if (!response.ok) throw new Error('Failed to get compliance status')

    return await response.json()
  } catch (error) {
    console.error('Compliance status error:', error)
    return {
      allCompliant: false,
      expired: 0,
      expiringSoon: 0,
      active: 0,
      documents: [],
    }
  }
}
