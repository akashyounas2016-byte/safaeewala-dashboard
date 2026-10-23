import { useEffect, useState, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { DataProvider, useData } from '@/store/DataContext'
import { UserProvider, useCurrentUser } from '@/store/UserContext'
import { NotificationProvider } from '@/store/NotificationContext'
import { Layout } from '@/components/layout/Layout'

// ── Lazy Loaded Page Components for Maximum Performance ──
const Overview               = lazy(() => import('@/pages/Overview').then(m => ({ default: m.Overview })))
const Bookings               = lazy(() => import('@/pages/Bookings').then(m => ({ default: m.Bookings })))
const FluentFormsLeads       = lazy(() => import('@/pages/FluentFormsLeads').then(m => ({ default: m.FluentFormsLeads })))
const Clients                = lazy(() => import('@/pages/Clients').then(m => ({ default: m.Clients })))
const ClientProfile          = lazy(() => import('@/pages/ClientProfile').then(m => ({ default: m.ClientProfile })))
const Employees              = lazy(() => import('@/pages/Employees').then(m => ({ default: m.Employees })))
const EmployeeProfile        = lazy(() => import('@/pages/EmployeeProfile').then(m => ({ default: m.EmployeeProfile })))
const RecurringSubscriptions = lazy(() => import('@/pages/RecurringSubscriptions').then(m => ({ default: m.RecurringSubscriptions })))
const PaymentProcessing      = lazy(() => import('@/pages/PaymentProcessing').then(m => ({ default: m.PaymentProcessing })))
const CustomerFeedback       = lazy(() => import('@/pages/CustomerFeedback').then(m => ({ default: m.CustomerFeedback })))
const MarketingDashboard     = lazy(() => import('@/pages/MarketingDashboard').then(m => ({ default: m.MarketingDashboard })))
const BusinessAnalytics      = lazy(() => import('@/pages/BusinessAnalytics').then(m => ({ default: m.BusinessAnalytics })))
const MonthlyInvoices        = lazy(() => import('@/pages/MonthlyInvoices').then(m => ({ default: m.MonthlyInvoices })))
const MonthlyClients         = lazy(() => import('@/pages/MonthlyClients').then(m => ({ default: m.MonthlyClients })))
const Invoices               = lazy(() => import('@/pages/Invoices').then(m => ({ default: m.Invoices })))
const Inventory              = lazy(() => import('@/pages/Inventory').then(m => ({ default: m.Inventory })))
const Expenses               = lazy(() => import('@/pages/Expenses').then(m => ({ default: m.Expenses })))
const Reports                = lazy(() => import('@/pages/Reports').then(m => ({ default: m.Reports })))
const Settings               = lazy(() => import('@/pages/Settings').then(m => ({ default: m.Settings })))
const DailyJobSheet          = lazy(() => import('@/pages/DailyJobSheet').then(m => ({ default: m.DailyJobSheet })))

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
  // Authentication disabled temporarily for development (as requested: will be enabled at the end)
  return <>{children}</>
}

function AppRoutes() {
  const { bookings, invoices, inventory } = useData()
  return (
    <NotificationProvider bookings={bookings} invoices={invoices} inventory={inventory}>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Overview />} />
              <Route path="bookings"   element={<Bookings />} />
              <Route path="fluent-forms" element={<FluentFormsLeads />} />
              <Route path="clients"    element={<Clients />} />
              <Route path="clients/:id" element={<ClientProfile />} />
              <Route path="employees"  element={<Employees />} />
              <Route path="employees/:id" element={<EmployeeProfile />} />
              <Route path="subscriptions" element={<RecurringSubscriptions />} />
              <Route path="payments" element={<PaymentProcessing />} />
              <Route path="feedback" element={<CustomerFeedback />} />
              <Route path="marketing" element={<MarketingDashboard />} />
              <Route path="analytics" element={<BusinessAnalytics />} />
              <Route path="monthly-invoices" element={<MonthlyInvoices />} />
              <Route path="monthly-clients" element={<MonthlyClients />} />
              <Route path="invoices"   element={<Invoices />} />
              <Route path="inventory"  element={<Inventory />} />
              <Route path="expenses"   element={<Expenses />} />
              <Route path="reports"    element={<Reports />} />
              <Route path="settings"   element={<Settings />} />
              <Route path="daily-job-sheet" element={
                <AdminRoute><DailyJobSheet /></AdminRoute>
              } />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </NotificationProvider>
  )
}

export default function App() {
  return (
    <AuthGuard>
      <DataProvider>
        <UserProvider>
          <AppRoutes />
        </UserProvider>
      </DataProvider>
    </AuthGuard>
  )
}
