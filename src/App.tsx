import { lazy, Suspense, useEffect, useState } from 'react'
import { pullCloudState } from '@/lib/cloudState'
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation, Link } from 'react-router-dom'
import { DataProvider, useData } from '@/store/DataContext'
import { UserProvider, useAuth, useRolePerms } from '@/store/UserContext'
import { canAccessModule, firstAllowedPath, moduleForPath } from '@/lib/permissions'
import { NotificationProvider } from '@/store/NotificationContext'
import { Layout } from '@/components/layout/Layout'
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

function AuthMessage({ icon, title, text, onSignOut }: { icon: string; title: string; text: string; onSignOut: () => void }) {
  return (
    <div className="min-h-screen bg-[#f0f4f8] flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-5 text-3xl">{icon}</div>
        <h2 className="text-[20px] font-black text-[#111827] mb-2">{title}</h2>
        <p className="text-[13px] text-slate-500 mb-8">{text}</p>
        <button onClick={onSignOut} className="text-[12px] text-slate-500 underline hover:text-slate-700 cursor-pointer">Sign out</button>
      </div>
    </div>
  )
}

/** Login is required everywhere, localhost included — the database only answers signed-in users (SEC-01, DEC-014) */
function AuthGate({ children }: { children: React.ReactNode }) {
  const { status, user, signOut } = useAuth()
  // Screens read payments / attendance from localStorage on mount, so bring the cloud copy in
  // right after sign-in (max ~2.5 s; on failure the app starts with what this browser has) — AUD-02
  const [cloudPulledFor, setCloudPulledFor] = useState<string | null>(null)
  useEffect(() => {
    if (status !== 'ready' || !user) return
    let alive = true
    void pullCloudState().finally(() => { if (alive) setCloudPulledFor(user.id) })
    return () => { alive = false }
  }, [status, user])
  if (status === 'ready' && user && cloudPulledFor !== user.id) return <div className="min-h-screen flex items-center justify-center"><PageLoader /></div>
  if (status === 'loading') return <div className="min-h-screen flex items-center justify-center"><PageLoader /></div>
  if (status === 'signed_out') return <Login />
  if (status === 'no_profile') return <AuthMessage icon="⏳" title="Account not set up" text="This login has no profile yet. Ask the admin to add you in Settings → Users." onSignOut={signOut} />
  if (status === 'disabled') return <AuthMessage icon="✗" title="Account disabled" text="Your access has been turned off. Contact the admin." onSignOut={signOut} />
  return <>{children}</>
}

/** Screen permission by role (R-SEC-03): blocks the URL too, not only the sidebar link */
function ModuleGate() {
  const { user } = useAuth()
  const perms = useRolePerms()
  const { pathname } = useLocation()
  const module = moduleForPath(pathname)
  if (!module || canAccessModule(user?.role, perms, module)) return <Outlet />
  const home = firstAllowedPath(user?.role, perms)
  if (pathname === '/' && home && home !== '/') return <Navigate to={home} replace />
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <div className="text-3xl mb-3">🔒</div>
        <h2 className="text-[18px] font-black text-[#111827]">No access to {module}</h2>
        <p className="text-[13px] text-slate-500 mt-1">Your role does not include this screen. Ask the admin if you need it.</p>
        {home && <Link to={home} className="inline-block mt-4 text-[13px] font-bold text-emerald-700 hover:underline">Go to my screens</Link>}
      </div>
    </div>
  )
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
              <Route element={<ModuleGate />}>
                <Route path="daily-job-sheet/spreadsheet" element={<JobSheetSpreadsheet />} />
              </Route>

              <Route element={<Layout />}>
               <Route element={<ModuleGate />}>
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
                <Route path="daily-job-sheet" element={<DailyJobSheet />} />
                <Route path="login" element={<Navigate to="/" replace />} />
               </Route>
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
    <UserProvider>
      <AuthGate>
        <DataProvider>
          <AppRoutes />
        </DataProvider>
      </AuthGate>
    </UserProvider>
  )
}
