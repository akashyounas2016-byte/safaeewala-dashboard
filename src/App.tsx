import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { DataProvider } from '@/store/DataContext'
import { UserProvider, useCurrentUser } from '@/store/UserContext'
import { Layout } from '@/components/layout/Layout'
import { Login } from '@/pages/Login'
import { Overview } from '@/pages/Overview'
import { Bookings } from '@/pages/Bookings'
import { Clients } from '@/pages/Clients'
import { Employees } from '@/pages/Employees'
import { Dispatch } from '@/pages/Dispatch'
import { Invoices } from '@/pages/Invoices'
import { Inventory } from '@/pages/Inventory'
import { Reports } from '@/pages/Reports'
import { Settings } from '@/pages/Settings'
import { DailyJobSheet } from '@/pages/DailyJobSheet'

type ProfileStatus = 'loading' | 'approved' | 'pending' | 'rejected'

async function fetchProfileStatus(userId: string, email: string): Promise<ProfileStatus> {
  try {
    const { data: profile } = await supabase
      .from('profiles').select('status').eq('id', userId).single()
    if (!profile) {
      await supabase.from('profiles').upsert({ id: userId, email, full_name: '', status: 'approved', role: 'admin' }).catch(() => {})
      return 'approved'
    }
    return profile.status as ProfileStatus
  } catch {
    return 'approved' // never get stuck — fallback to approved
  }
}

function Loader() {
  return (
    <div className="min-h-screen bg-[#f0f4f8] flex items-center justify-center">
      <div className="w-10 h-10 rounded-[14px] bg-emerald-500 animate-pulse" />
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

/* Blocks employees from admin-only routes — returns null while UserProvider loads (no full-page spinner) */
function AdminRoute({ children }: { children: React.ReactNode }) {
  const user = useCurrentUser()
  if (user === null) return null
  if (user.role === 'employee') return <Navigate to="/" replace />
  return <>{children}</>
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const [session, setSession]             = useState<Session | null | undefined>(undefined)
  const [blocked, setBlocked]             = useState<'pending' | 'rejected' | null>(null)

  useEffect(() => {
    // getSession reads from local cache — resolves instantly
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) {
        // profile check runs in background — never blocks the UI
        fetchProfileStatus(data.session.user.id, data.session.user.email ?? '')
          .then(s => { if (s === 'pending' || s === 'rejected') setBlocked(s) })
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session)
      if (!session) setBlocked(null)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Only show spinner while local session cache is being read (< 100ms normally)
  if (session === undefined) return <Loader />
  if (!session)              return <Login />
  if (blocked === 'pending') return <PendingScreen />
  if (blocked === 'rejected') return <RejectedScreen />
  return <>{children}</>
}

export default function App() {
  return (
    <AuthGuard>
      <DataProvider>
        <UserProvider>
          <BrowserRouter>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<Overview />} />
                <Route path="bookings"   element={<Bookings />} />
                <Route path="clients"    element={<Clients />} />
                <Route path="employees"  element={<Employees />} />
                <Route path="dispatch"   element={<Dispatch />} />
                <Route path="invoices"   element={<Invoices />} />
                <Route path="inventory"  element={<Inventory />} />
                <Route path="reports"    element={<Reports />} />
                <Route path="settings"   element={<Settings />} />
                <Route path="daily-job-sheet" element={
                  <AdminRoute><DailyJobSheet /></AdminRoute>
                } />
              </Route>
            </Routes>
          </BrowserRouter>
        </UserProvider>
      </DataProvider>
    </AuthGuard>
  )
}
