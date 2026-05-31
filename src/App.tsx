import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { DataProvider } from '@/store/DataContext'
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
  const { data: profile } = await supabase
    .from('profiles')
    .select('status')
    .eq('id', userId)
    .single()

  if (!profile) {
    // No profile = legacy/owner user → auto-approve so they're never locked out
    await supabase.from('profiles').upsert({
      id: userId,
      email,
      full_name: '',
      status: 'approved',
    })
    return 'approved'
  }

  return profile.status as ProfileStatus
}

function PendingScreen() {
  return (
    <div className="min-h-screen bg-[#f0f4f8] flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-5">
          <span className="text-3xl">⏳</span>
        </div>
        <h2 className="text-[20px] font-black text-[#111827] mb-2">Pending Approval</h2>
        <p className="text-[13px] text-slate-500 mb-8">
          Your account is waiting for admin approval. You will be able to access the dashboard once an admin reviews your request.
        </p>
        <button
          onClick={() => supabase.auth.signOut()}
          className="text-[12px] text-slate-500 underline hover:text-slate-700"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}

function RejectedScreen() {
  return (
    <div className="min-h-screen bg-[#f0f4f8] flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-5">
          <span className="text-3xl">✗</span>
        </div>
        <h2 className="text-[20px] font-black text-[#111827] mb-2">Access Denied</h2>
        <p className="text-[13px] text-slate-500 mb-8">
          Your access request was not approved. Please contact the admin if you believe this is a mistake.
        </p>
        <button
          onClick={() => supabase.auth.signOut()}
          className="text-[12px] text-slate-500 underline hover:text-slate-700"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}

function Loader() {
  return (
    <div className="min-h-screen bg-[#f0f4f8] flex items-center justify-center">
      <div className="w-10 h-10 rounded-[14px] bg-emerald-500 animate-pulse" />
    </div>
  )
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const [session, setSession]           = useState<Session | null | undefined>(undefined)
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>('loading')

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      if (data.session) {
        const status = await fetchProfileStatus(data.session.user.id, data.session.user.email ?? '')
        setProfileStatus(status)
      } else {
        setProfileStatus('approved') // not logged in yet
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session)
      if (session) {
        const status = await fetchProfileStatus(session.user.id, session.user.email ?? '')
        setProfileStatus(status)
      } else {
        setProfileStatus('approved')
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined || (session && profileStatus === 'loading')) return <Loader />
  if (!session)                        return <Login />
  if (profileStatus === 'pending')     return <PendingScreen />
  if (profileStatus === 'rejected')    return <RejectedScreen />

  return <>{children}</>
}

export default function App() {
  return (
    <AuthGuard>
      <DataProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Overview />} />
              <Route path="bookings" element={<Bookings />} />
              <Route path="clients" element={<Clients />} />
              <Route path="employees" element={<Employees />} />
              <Route path="dispatch" element={<Dispatch />} />
              <Route path="invoices" element={<Invoices />} />
              <Route path="inventory" element={<Inventory />} />
              <Route path="reports" element={<Reports />} />
              <Route path="settings" element={<Settings />} />
              <Route path="daily-job-sheet" element={<DailyJobSheet />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </DataProvider>
    </AuthGuard>
  )
}
