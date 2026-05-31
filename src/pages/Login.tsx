import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    }
    // On success, AuthGuard in App.tsx automatically re-renders with the session
  }

  return (
    <div className="min-h-screen bg-[#f0f4f8] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-[18px] bg-emerald-500 flex items-center justify-center text-white font-black text-2xl shadow-lg mb-4">
            S
          </div>
          <h1 className="text-[22px] font-black text-[#111827] tracking-tight">Safaeewala</h1>
          <p className="text-[13px] text-slate-500 mt-1">Operations Dashboard</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-[24px] border border-[#E4E8EC] shadow-[0_8px_40px_rgba(15,23,42,0.10)] p-7">
          <h2 className="text-[17px] font-bold text-[#111827] mb-1">Sign in</h2>
          <p className="text-[12px] text-slate-500 mb-6">Enter your credentials to access the dashboard</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[11.5px] font-semibold text-slate-600 uppercase tracking-[0.08em] mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@safaeewala.com"
                className="w-full text-[13px] px-3.5 py-2.5 border border-[#E4E8EC] rounded-xl bg-[#f8fafc] focus:outline-none focus:border-emerald-400 focus:bg-white placeholder-slate-400 transition-colors"
              />
            </div>
            <div>
              <label className="block text-[11.5px] font-semibold text-slate-600 uppercase tracking-[0.08em] mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full text-[13px] px-3.5 py-2.5 border border-[#E4E8EC] rounded-xl bg-[#f8fafc] focus:outline-none focus:border-emerald-400 focus:bg-white placeholder-slate-400 transition-colors"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <p className="text-[12px] text-red-700 font-medium">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#111827] hover:bg-[#1f2937] disabled:opacity-60 text-white font-semibold text-[13px] py-3 rounded-xl transition-colors"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="text-[11px] text-slate-400 text-center mt-5">
            Access restricted to authorised staff only
          </p>
        </div>

      </div>
    </div>
  )
}
