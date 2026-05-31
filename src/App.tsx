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

function AuthGuard({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) {
    return (
      <div className="min-h-screen bg-[#f0f4f8] flex items-center justify-center">
        <div className="w-10 h-10 rounded-[14px] bg-emerald-500 animate-pulse" />
      </div>
    )
  }

  if (!session) return <Login />
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
