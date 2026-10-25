import { useState, useEffect } from 'react'
import {
  User, Lock, Eye, EyeOff, ShieldCheck, AlertCircle,
  ArrowRight, Loader2, Sparkles
} from 'lucide-react'
import { useSimpleAuth, checkRateLimit } from '@/lib/simpleAuth'

interface LoginProps {
  onLoginSuccess?: () => void
}

export function Login({ onLoginSuccess }: LoginProps) {
  const { login } = useSimpleAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [lockedSeconds, setLockedSeconds] = useState(0)

  // Check rate limit timer on mount
  useEffect(() => {
    const rate = checkRateLimit()
    if (rate.isLocked) {
      setLockedSeconds(rate.remainingSeconds)
    }
  }, [])

  // Countdown timer for lockout
  useEffect(() => {
    if (lockedSeconds <= 0) return
    const interval = setInterval(() => {
      setLockedSeconds(prev => {
        if (prev <= 1) {
          setError(null)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [lockedSeconds])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (lockedSeconds > 0) {
      setError(`Baraye meherbani ${lockedSeconds} second intezar karein.`)
      return
    }

    if (!username.trim() || !password.trim()) {
      setError('Username aur password dono darj karna lazmi hai.')
      return
    }

    setLoading(true)

    // Micro-delay for realistic feedback
    setTimeout(() => {
      const res = login(username, password, rememberMe)
      setLoading(false)

      if (res.success) {
        if (onLoginSuccess) {
          onLoginSuccess()
        }
      } else {
        setError(res.error || 'Ghalat credentials!')
        const rate = checkRateLimit()
        if (rate.isLocked) {
          setLockedSeconds(rate.remainingSeconds)
        }
      }
    }, 350)
  }

  return (
    <div className="min-h-screen bg-[#070d10] relative flex items-center justify-center p-4 selection:bg-emerald-500 selection:text-white overflow-hidden">
      {/* Background ambient gradient glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[450px] bg-gradient-to-b from-[#064e3b]/30 via-[#0d8a72]/10 to-transparent blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 -right-20 w-[400px] h-[400px] bg-emerald-950/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -top-20 -left-20 w-[400px] h-[400px] bg-teal-950/20 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-[420px] relative z-10">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-7">
          <div className="relative mb-3 group">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center font-black text-2xl text-white shadow-[0_10px_35px_rgba(13,138,114,0.35)] border border-emerald-400/30 group-hover:scale-105 transition-transform"
              style={{ background: 'linear-gradient(135deg, #10b981 0%, #064e3b 100%)' }}
            >
              S
            </div>
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-400 rounded-full ring-4 ring-[#070d10] animate-pulse" />
          </div>

          <h1 className="text-[26px] font-black text-white tracking-tight flex items-center gap-1.5">
            Safaeewala <span className="text-emerald-400">CRM</span>
          </h1>
          <p className="text-[12.5px] text-slate-400 mt-1 font-medium">
            Operations & Booking Management · Dubai
          </p>

          <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-[11px] font-bold text-emerald-300">
            <ShieldCheck size={12} className="text-emerald-400" />
            <span>Secure Admin Authentication</span>
          </div>
        </div>

        {/* Login Card */}
        <div className="bg-[#0f171c]/90 backdrop-blur-xl rounded-[28px] border border-[#1e2f38] shadow-[0_20px_60px_rgba(0,0,0,0.6)] p-7 md:p-8">
          <div className="mb-6">
            <h2 className="text-[18px] font-bold text-white tracking-tight">Sign In</h2>
            <p className="text-[12px] text-slate-400 mt-0.5">
              Enter your credentials to unlock the operations dashboard
            </p>
          </div>

          {/* Error / Alert Box */}
          {error && (
            <div className="mb-5 p-3.5 rounded-2xl bg-rose-950/60 border border-rose-500/30 text-rose-300 flex items-start gap-2.5 text-[12px] animate-in fade-in zoom-in-95 duration-200">
              <AlertCircle size={16} className="text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium leading-relaxed">
                {error}
                {lockedSeconds > 0 && (
                  <span className="block mt-1 font-bold text-rose-200">
                    ⏱️ Remaining lock: {lockedSeconds}s
                  </span>
                )}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4.5">
            {/* Username Input */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <User size={16} />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoComplete="username"
                  autoFocus
                  disabled={loading || lockedSeconds > 0}
                  placeholder="e.g. admin"
                  className="w-full pl-10 pr-4 py-2.5 bg-[#091116] border border-[#1f2f38] rounded-xl text-white text-[13.5px] placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 transition-colors disabled:opacity-50"
                />
              </div>
            </div>

            {/* Password Input */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Lock size={16} />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  disabled={loading || lockedSeconds > 0}
                  placeholder="••••••••••••"
                  className="w-full pl-10 pr-11 py-2.5 bg-[#091116] border border-[#1f2f38] rounded-xl text-white text-[13.5px] placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 transition-colors disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 hover:text-slate-300 cursor-pointer"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Remember Me */}
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded bg-[#091116] border-[#1f2f38] text-emerald-600 focus:ring-emerald-500/30 focus:ring-offset-0 cursor-pointer accent-emerald-500"
                />
                <span className="text-[12px] text-slate-400 font-medium">Remember this session</span>
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || lockedSeconds > 0}
              className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-[0.98] text-white font-bold text-[13.5px] shadow-[0_10px_25px_rgba(16,185,129,0.25)] flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin text-white" />
                  <span>Verifying credentials...</span>
                </>
              ) : (
                <>
                  <span>Sign In to CRM</span>
                  <ArrowRight size={15} className="group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          {/* Footer Notice */}
          <div className="mt-6 pt-5 border-t border-[#1a2933] text-center">
            <p className="text-[11px] text-slate-500 flex items-center justify-center gap-1 font-medium">
              <Sparkles size={11} className="text-emerald-500" />
              <span>Safaeewala LLC Internal Operations Portal</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
export default Login
