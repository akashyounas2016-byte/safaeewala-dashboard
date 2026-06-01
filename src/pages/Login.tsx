import { useState } from 'react'
import { supabase } from '@/lib/supabase'

type Mode = 'login' | 'signup' | 'forgot'

export function Login() {
  const [mode, setMode] = useState<Mode>('login')

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

        {/* Tab toggle — only show on login/signup */}
        {mode !== 'forgot' && (
          <div className="flex bg-white rounded-2xl border border-[#E4E8EC] p-1 mb-4 shadow-sm">
            {(['login', 'signup'] as Mode[]).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-2 rounded-xl text-[13px] font-semibold transition-colors ${
                  mode === m ? 'bg-[#111827] text-white' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {m === 'login' ? 'Sign In' : 'Request Access'}
              </button>
            ))}
          </div>
        )}

        {mode === 'login'  && <SignInForm onForgot={() => setMode('forgot')} />}
        {mode === 'signup' && <SignUpForm onSwitch={() => setMode('login')} />}
        {mode === 'forgot' && <ForgotForm onBack={() => setMode('login')} />}

      </div>
    </div>
  )
}

function SignInForm({ onForgot }: { onForgot: () => void }) {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false) }
  }

  return (
    <div className="bg-white rounded-[24px] border border-[#E4E8EC] shadow-[0_8px_40px_rgba(15,23,42,0.10)] p-7">
      <h2 className="text-[17px] font-bold text-[#111827] mb-1">Sign in</h2>
      <p className="text-[12px] text-slate-500 mb-6">Enter your credentials to access the dashboard</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="you@safaeewala.com" />
        <Field label="Password" type="password" value={password} onChange={setPassword} placeholder="••••••••" />

        {error && <ErrorBox message={error} />}

        <SubmitButton loading={loading} label="Sign in" loadingLabel="Signing in…" />
      </form>

      <button onClick={onForgot} className="w-full text-center text-[12px] text-emerald-600 hover:underline mt-4">
        Forgot password?
      </button>
    </div>
  )
}

function ForgotForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail]   = useState('')
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone]     = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    })
    if (error) { setError(error.message); setLoading(false); return }
    setDone(true)
  }

  return (
    <div className="bg-white rounded-[24px] border border-[#E4E8EC] shadow-[0_8px_40px_rgba(15,23,42,0.10)] p-7">
      {done ? (
        <div className="text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4 text-xl">✓</div>
          <h2 className="text-[17px] font-bold text-[#111827] mb-2">Check your email</h2>
          <p className="text-[12px] text-slate-500 mb-5">We sent a password reset link to <strong>{email}</strong>. Check your inbox and click the link.</p>
          <button onClick={onBack} className="text-[12px] text-emerald-600 hover:underline">Back to Sign In</button>
        </div>
      ) : (
        <>
          <h2 className="text-[17px] font-bold text-[#111827] mb-1">Reset Password</h2>
          <p className="text-[12px] text-slate-500 mb-6">Enter your email and we'll send a reset link</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="you@safaeewala.com" />
            {error && <ErrorBox message={error} />}
            <SubmitButton loading={loading} label="Send Reset Link" loadingLabel="Sending…" />
          </form>
          <button onClick={onBack} className="w-full text-center text-[12px] text-slate-400 hover:text-slate-600 mt-4">
            ← Back to Sign In
          </button>
        </>
      )}
    </div>
  )
}

function SignUpForm({ onSwitch }: { onSwitch: () => void }) {
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [done, setDone]         = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    setError(''); setLoading(true)

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    })
    if (error) { setError(error.message); setLoading(false); return }

    // Insert profile directly — more reliable than a DB trigger
    if (data.user) {
      const { error: profileError } = await supabase.from('profiles').upsert({
        id:        data.user.id,
        email:     data.user.email ?? email,
        full_name: name,
        status:    'pending',
      })
      if (profileError) {
        setError('Account created but profile save failed: ' + profileError.message)
        setLoading(false)
        return
      }
    }

    setDone(true)
  }

  if (done) {
    return (
      <div className="bg-white rounded-[24px] border border-[#E4E8EC] shadow-[0_8px_40px_rgba(15,23,42,0.10)] p-7 text-center">
        <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">✓</span>
        </div>
        <h2 className="text-[17px] font-bold text-[#111827] mb-2">Request Submitted</h2>
        <p className="text-[13px] text-slate-500 mb-6">
          Your account has been created. The admin will review and approve your access shortly. You will be able to sign in once approved.
        </p>
        <button
          onClick={onSwitch}
          className="w-full bg-[#111827] text-white font-semibold text-[13px] py-3 rounded-xl hover:bg-[#1f2937] transition-colors"
        >
          Back to Sign In
        </button>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-[24px] border border-[#E4E8EC] shadow-[0_8px_40px_rgba(15,23,42,0.10)] p-7">
      <h2 className="text-[17px] font-bold text-[#111827] mb-1">Request Access</h2>
      <p className="text-[12px] text-slate-500 mb-6">Submit a request — admin approval required before you can sign in</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Full Name" type="text" value={name} onChange={setName} placeholder="Your full name" />
        <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" />
        <Field label="Password" type="password" value={password} onChange={setPassword} placeholder="Min. 6 characters" />

        {error && <ErrorBox message={error} />}

        <SubmitButton loading={loading} label="Submit Request" loadingLabel="Submitting…" />
      </form>

      <p className="text-[11px] text-slate-400 text-center mt-5">
        Your account will be inactive until an admin approves it
      </p>
    </div>
  )
}

/* ─── Shared sub-components ─── */
function Field({ label, type, value, onChange, placeholder }: {
  label: string; type: string; value: string
  onChange: (v: string) => void; placeholder: string
}) {
  return (
    <div>
      <label className="block text-[11.5px] font-semibold text-slate-600 uppercase tracking-[0.08em] mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        required
        placeholder={placeholder}
        className="w-full text-[13px] px-3.5 py-2.5 border border-[#E4E8EC] rounded-xl bg-[#f8fafc] focus:outline-none focus:border-emerald-400 focus:bg-white placeholder-slate-400 transition-colors"
      />
    </div>
  )
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
      <p className="text-[12px] text-red-700 font-medium">{message}</p>
    </div>
  )
}

function SubmitButton({ loading, label, loadingLabel }: { loading: boolean; label: string; loadingLabel: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full bg-[#111827] hover:bg-[#1f2937] disabled:opacity-60 text-white font-semibold text-[13px] py-3 rounded-xl transition-colors"
    >
      {loading ? loadingLabel : label}
    </button>
  )
}
