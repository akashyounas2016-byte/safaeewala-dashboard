import { useEffect, useState, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { DataProvider, useData } from '@/store/DataContext'
import { UserProvider, useCurrentUser } from '@/store/UserContext'
import { NotificationProvider } from '@/store/NotificationContext'
import { Layout } from '@/components/layout/Layout'
import { SimpleAuthProvider, useSimpleAuth, isLocalEnvironment } from '@/lib/simpleAuth'
import { Login } from '@/pages/Login'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'

// ── Resilient Lazy Loading for Dynamic Imports (Handles Vite HMR & Server restarts) ──
function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      return await factory()
    } catch (error: any) {
      const errMsg = error?.message || ''
      const isDynamicImportFailure =
        errMsg.includes('Failed to fetch dynamically imported module') ||
        errMsg.includes('Importing a module script failed') ||
        error?.name === 'ChunkLoadError'

      if (isDynamicImportFailure) {
        const reloadKey = 'vite_lazy_retry_' + window.location.pathname
        const alreadyRetried = sessionStorage.getItem(reloadKey)
        if (!alreadyRetried) {
          sessionStorage.setItem(reloadKey, '1')
          window.location.reload()
          return new Promise<{ default: T }>(() => {})
        }
        sessionStorage.removeItem(reloadKey)
      }
      throw error
    }
  })
}

// ── Lazy Loaded Page Components for Maximum Performance ──
const Overview               = lazyWithRetry(() => import('@/pages/Overview').then(m => ({ default: m.Overview })))
const Bookings               = lazyWithRetry(() => import('@/pages/Bookings').then(m => ({ default: m.Bookings })))
const FluentFormsLeads       = lazyWithRetry(() => import('@/pages/FluentFormsLeads').then(m => ({ default: m.FluentFormsLeads })))
const WhatsAppCRM            = lazyWithRetry(() => import('@/pages/WhatsAppCRM').then(m => ({ default: m.WhatsAppCRM })))
const Clients                = lazyWithRetry(() => import('@/pages/Clients').then(m => ({ default: m.Clients })))
const ClientProfile          = lazyWithRetry(() => import('@/pages/ClientProfile').then(m => ({ default: m.ClientProfile })))
const Employees              = lazyWithRetry(() => import('@/pages/Employees').then(m => ({ default: m.Employees })))
const EmployeeProfile        = lazyWithRetry(() => import('@/pages/EmployeeProfile').then(m => ({ default: m.EmployeeProfile })))
const Agencies               = lazyWithRetry(() => import('@/pages/Agencies').then(m => ({ default: m.Agencies })))
const AgencyProfile          = lazyWithRetry(() => import('@/pages/AgencyProfile').then(m => ({ default: m.AgencyProfile })))
const PaymentProcessing      = lazyWithRetry(() => import('@/pages/PaymentProcessing').then(m => ({ default: m.PaymentProcessing })))
const CustomerFeedback       = lazyWithRetry(() => import('@/pages/CustomerFeedback').then(m => ({ default: m.CustomerFeedback })))
const MarketingDashboard     = lazyWithRetry(() => import('@/pages/MarketingDashboard').then(m => ({ default: m.MarketingDashboard })))
const BusinessAnalytics      = lazyWithRetry(() => import('@/pages/BusinessAnalytics').then(m => ({ default: m.BusinessAnalytics })))
const MonthlyInvoices        = lazyWithRetry(() => import('@/pages/MonthlyInvoices').then(m => ({ default: m.MonthlyInvoices })))
const MonthlyClients         = lazyWithRetry(() => import('@/pages/MonthlyClients').then(m => ({ default: m.MonthlyClients })))
const Invoices               = lazyWithRetry(() => import('@/pages/Invoices').then(m => ({ default: m.Invoices })))
const Inventory              = lazyWithRetry(() => import('@/pages/Inventory').then(m => ({ default: m.Inventory })))
const Expenses               = lazyWithRetry(() => import('@/pages/Expenses').then(m => ({ default: m.Expenses })))
const Reports                = lazyWithRetry(() => import('@/pages/Reports').then(m => ({ default: m.Reports })))
const Settings               = lazyWithRetry(() => import('@/pages/Settings').then(m => ({ default: m.Settings })))
const DailyJobSheet          = lazyWithRetry(() => import('@/pages/DailyJobSheet').then(m => ({ default: m.DailyJobSheet })))
const JobSheetSpreadsheet     = lazyWithRetry(() => import('@/pages/JobSheetSpreadsheet').then(m => ({ default: m.JobSheetSpreadsheet })))
const PendingPayments        = lazyWithRetry(() => import('@/pages/PendingPayments').then(m => ({ default: m.PendingPayments })))
const Attendance             = lazyWithRetry(() => import('@/pages/Attendance').then(m => ({ default: m.Attendance })))

type ProfileStatus = 'approved' | 'pending' | 'rejected'

async function fetchProfileStatus(userId: string, email: string): Promise<ProfileStatus> {
  try {
    const { data: profile } = await supabase
      .from('profiles').select('status').eq('id', userId).single()
    if (!profile) {
      await supabase.from('profiles')
        .upsert({ id: userId, email, full_name: '', status: 'pending', role: 'employee' })
        .then(() => {}, () => {})
      return 'approved'
    }
    return profile.status as ProfileStatus
  } catch {
    return 'approved'
  }
}

function PageLoader() {
  return (
    <div className="min-h-[450px] flex flex-col items-center justify-center p-8 animate-in fade-in duration-200">
      <div className="relative flex items-center justify-center">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 animate-spin flex items-center justify-center shadow-lg shadow-emerald-500/20">
          <div className="w-7 h-7 rounded-xl bg-white" />
        </div>
      </div>
      <p className="mt-4 text-[13px] font-bold text-slate-700 tracking-tight">Safaeewala CRM</p>
      <p className="text-[11px] text-slate-400 font-medium">Loading module...</p>
    </div>
  )
}

function PendingScreen() {
  return (
    <div className="min-h-screen bg-[#f0f4f8] flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-5 text-3xl">⏳</div>
        <h2 className="text-[20px] font-black text-[#111827] mb-2">Pending Approval</h2>
        <p className="text-[13px] text-slate-500 mb-8">Your account is waiting for admin approval.</p>
        <button onClick={() => supabase.auth.signOut()} className="text-[12px] text-slate-500 underline hover:text-slate-700">Sign out</button>
      </div>
    </div>
  )
}

function RejectedScreen() {
  return (
    <div className="min-h-screen bg-[#f0f4f8] flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-5 text-3xl">✗</div>
        <h2 className="text-[20px] font-black text-[#111827] mb-2">Access Denied</h2>
        <p className="text-[13px] text-slate-500 mb-8">Your access request was not approved. Contact the admin.</p>
        <button onClick={() => supabase.auth.signOut()} className="text-[12px] text-slate-500 underline hover:text-slate-700">Sign out</button>
      </div>
    </div>
  )
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const user = useCurrentUser()
  if (user === null) return null
  if (user.role === 'employee') return <Navigate to="/" replace />
  return <>{children}</>
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const isLocal = isLocalEnvironment()
  const { isAuthenticated } = useSimpleAuth()

  // Local environment: login screen is disabled
  if (isLocal) {
    return <>{children}</>
  }

  // VPS / Production: login screen is enforced
  if (!isAuthenticated) {
    return <Login />
  }
  return <>{children}</>
}

function AppRoutes() {
  const { bookings, invoices, inventory } = useData()
  return (
    <NotificationProvider bookings={bookings} invoices={invoices} inventory={inventory}>
      <BrowserRouter>
        <ErrorBoundary>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Standalone Full-Width Excel Spreadsheet (No Sidebar) */}
              <Route
                path="daily-job-sheet/spreadsheet"
                element={
                  <AdminRoute>
                    <JobSheetSpreadsheet />
                  </AdminRoute>
                }
              />

              <Route element={<Layout />}>
                <Route index element={<Overview />} />
                <Route path="bookings"   element={<Bookings />} />
                <Route path="fluent-forms" element={<FluentFormsLeads />} />
                <Route path="whatsapp-crm" element={<WhatsAppCRM />} />
                <Route path="clients"    element={<Clients />} />
                <Route path="clients/:id" element={<ClientProfile />} />
                <Route path="employees"  element={<Employees />} />
                <Route path="employees/:id" element={<EmployeeProfile />} />
                <Route path="agencies"   element={<Agencies />} />
                <Route path="agencies/:id" element={<AgencyProfile />} />
                <Route path="subscriptions" element={<Navigate to="/monthly-clients" replace />} />
                <Route path="payments" element={<PaymentProcessing />} />
                <Route path="feedback" element={<CustomerFeedback />} />
                <Route path="marketing" element={<MarketingDashboard />} />
                <Route path="analytics" element={<BusinessAnalytics />} />
                <Route path="monthly-invoices" element={<MonthlyInvoices />} />
                <Route path="monthly-clients" element={<MonthlyClients />} />
                <Route path="invoices"   element={<Invoices />} />
                <Route path="inventory"  element={<Inventory />} />
                <Route path="expenses"   element={<Expenses />} />
                <Route path="pending"    element={<PendingPayments />} />
                <Route path="reports"    element={<Reports />} />
                <Route path="settings"   element={<Settings />} />
                <Route path="attendance" element={<Attendance />} />
                <Route path="daily-job-sheet" element={
                  <AdminRoute><DailyJobSheet /></AdminRoute>
                } />
                <Route path="login" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </BrowserRouter>
    </NotificationProvider>
  )
}

export default function App() {
  return (
    <SimpleAuthProvider>
      <AuthGuard>
        <DataProvider>
          <UserProvider>
            <AppRoutes />
          </UserProvider>
        </DataProvider>
      </AuthGuard>
    </SimpleAuthProvider>
  )
}
