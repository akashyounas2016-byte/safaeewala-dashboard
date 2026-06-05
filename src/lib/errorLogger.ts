// Production Error Logging & Monitoring System

export interface ErrorLog {
  id: string
  timestamp: string
  severity: 'critical' | 'error' | 'warning' | 'info'
  type: string
  message: string
  stackTrace?: string
  userEmail?: string
  page: string
  userAgent: string
  action?: string
  data?: Record<string, any>
}

// Store errors in IndexedDB for offline support
class ErrorDatabase {
  private dbName = 'SafaeewalaErrorLogs'
  private storeName = 'errors'

  async init(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
      request.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'id' })
        }
      }
    })
  }

  async addError(error: ErrorLog): Promise<void> {
    const db = await this.init()
    const tx = db.transaction(this.storeName, 'readwrite')
    tx.objectStore(this.storeName).add(error)
  }

  async getAllErrors(): Promise<ErrorLog[]> {
    const db = await this.init()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly')
      const request = tx.objectStore(this.storeName).getAll()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }
}

const errorDb = new ErrorDatabase()

// Main error logger
export class ErrorLogger {
  private static instance: ErrorLogger
  private sessionId = Math.random().toString(36).substr(2, 9)
  private errorCount = 0
  private criticalErrorThreshold = 5

  private constructor() {}

  static getInstance(): ErrorLogger {
    if (!this.instance) {
      this.instance = new ErrorLogger()
    }
    return this.instance
  }

  async logError(error: Error | string, context?: {
    severity?: ErrorLog['severity']
    type?: string
    action?: string
    data?: Record<string, any>
    page?: string
  }): Promise<void> {
    const errorLog: ErrorLog = {
      id: `${Date.now()}-${Math.random()}`,
      timestamp: new Date().toISOString(),
      severity: context?.severity || 'error',
      type: context?.type || (error instanceof Error ? error.name : 'Unknown'),
      message: error instanceof Error ? error.message : String(error),
      stackTrace: error instanceof Error ? error.stack : undefined,
      userEmail: sessionStorage.getItem('userEmail') || undefined,
      page: context?.page || window.location.pathname,
      userAgent: navigator.userAgent,
      action: context?.action,
      data: context?.data,
    }

    // Store locally first
    await errorDb.addError(errorLog)

    // Send to backend for centralized logging
    this.sendToBackend(errorLog)

    // Track critical errors
    if (errorLog.severity === 'critical') {
      this.errorCount++
      if (this.errorCount >= this.criticalErrorThreshold) {
        this.alertAdmins(errorLog)
      }
    }

    // Log to console in development
    if (typeof window !== 'undefined' && !window.location.hostname.includes('safaeewala')) {
      console.error(`[${errorLog.severity.toUpperCase()}] ${errorLog.type}: ${errorLog.message}`)
    }
  }

  private async sendToBackend(errorLog: ErrorLog): Promise<void> {
    try {
      await fetch('/api/logs/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorLog),
      }).catch(() => {
        // Fail silently if backend is down
        console.log('Failed to send error to backend, stored locally')
      })
    } catch (err) {
      // Ignore backend errors
    }
  }

  private alertAdmins(errorLog: ErrorLog): void {
    // Send critical alert email to admins
    fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: 'admin@safaeewala.com',
        subject: `🚨 Critical System Error - ${errorLog.type}`,
        template: 'error_alert',
        data: {
          errorMessage: errorLog.message,
          timestamp: errorLog.timestamp,
          userEmail: errorLog.userEmail || 'Unknown',
          page: errorLog.page,
          stackTrace: errorLog.stackTrace,
        },
      }),
    }).catch(() => {})
  }

  // Get error statistics
  async getErrorStats(timeWindowDays = 7): Promise<{
    totalErrors: number
    criticalCount: number
    errorsByType: Record<string, number>
    topErrors: ErrorLog[]
  }> {
    const allErrors = await errorDb.getAllErrors()
    const cutoff = Date.now() - timeWindowDays * 24 * 60 * 60 * 1000

    const recentErrors = allErrors.filter(e => new Date(e.timestamp).getTime() > cutoff)

    const errorsByType: Record<string, number> = {}
    let criticalCount = 0

    recentErrors.forEach(e => {
      errorsByType[e.type] = (errorsByType[e.type] || 0) + 1
      if (e.severity === 'critical') criticalCount++
    })

    return {
      totalErrors: recentErrors.length,
      criticalCount,
      errorsByType,
      topErrors: recentErrors.slice(-10), // Last 10 errors
    }
  }
}

// Global error handler
export function setupGlobalErrorHandler(): void {
  const logger = ErrorLogger.getInstance()

  // Handle uncaught errors
  window.addEventListener('error', (event) => {
    logger.logError(event.error, {
      severity: 'critical',
      type: 'UncaughtError',
      page: window.location.pathname,
    })
  })

  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    logger.logError(event.reason, {
      severity: 'error',
      type: 'UnhandledRejection',
      page: window.location.pathname,
    })
  })
}

// API call wrapper with error tracking
export async function apiCall<T>(
  url: string,
  options?: RequestInit,
  context?: { action?: string; data?: Record<string, any> }
): Promise<T> {
  const logger = ErrorLogger.getInstance()

  try {
    const response = await fetch(url, options)
    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`)
    }
    return await response.json()
  } catch (error) {
    logger.logError(error as Error, {
      severity: 'error',
      type: 'APIError',
      action: context?.action || url,
      data: context?.data,
      page: window.location.pathname,
    })
    throw error
  }
}
