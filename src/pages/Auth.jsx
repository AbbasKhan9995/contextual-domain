import { useState } from 'react'
import { LogIn, KeyRound, ShieldCheck } from 'lucide-react'
import { api } from '../lib/api.js'
import { ThemeToggle } from '../lib/theme.jsx'

function Shell({ title, sub, children }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 transition-colors">
      <div className="absolute right-6 top-6">
        <ThemeToggle className="!border-slate-800 !bg-slate-900 !text-slate-300 hover:!text-white" />
      </div>
      <div className="w-full max-w-sm">
        <a
          href="https://contextualdomain.com"
          target="_blank"
          rel="noopener noreferrer"
          className="group mb-6 flex items-center justify-center gap-2.5 transition hover:opacity-95"
          title="Visit contextualdomain.com"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-emerald-400 text-sm font-black text-white shadow-md transition-transform duration-200 group-hover:scale-105">CD</span>
          <span className="text-lg font-bold tracking-tight text-white transition-colors group-hover:text-indigo-300">Contextual Domain</span>
        </a>
        <div className="rounded-2xl border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-6 shadow-2xl transition-colors">
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{title}</h1>
          {sub && <p className="mb-4 mt-0.5 text-sm text-slate-500 dark:text-slate-400">{sub}</p>}
          {children}
        </div>
      </div>
    </div>
  )
}

// The input sits inside its <label>, so screen readers announce the field name.
const Field = ({ label, ...p }) => <label className="block"><span className="label">{label}</span><input className="input !py-2" {...p} /></label>

export function Login({ onDone }) {
  const [f, setF] = useState({ email: '', password: '' })
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('')
    try { await api.login(f); onDone() } catch (x) { setErr(x.message) } finally { setBusy(false) }
  }
  return (
    <Shell title="Log in" sub="Welcome back.">
      <form className="grid gap-3" onSubmit={submit}>
        <Field label="Email" type="email" autoComplete="username" autoFocus value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <Field label="Password" type="password" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        {err && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
        <button className="btn-primary justify-center !py-2" disabled={busy}><LogIn size={15} /> {busy ? 'Checking…' : 'Log in'}</button>
      </form>
    </Shell>
  )
}

export function Setup({ setupEnabled, onDone }) {
  const [f, setF] = useState({ name: '', email: '', password: '', password2: '', code: '' })
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const submit = async (e) => {
    e.preventDefault(); setErr('')
    if (f.password !== f.password2) return setErr("The two passwords don't match.")
    setBusy(true)
    try { await api.setup(f); onDone() } catch (x) { setErr(x.message) } finally { setBusy(false) }
  }
  if (!setupEnabled) {
    return (
      <Shell title="Almost there" sub="This install has no admin yet.">
        <p className="text-sm text-slate-600">In Vercel, open this project → <b>Settings → Environment Variables</b>, add <code className="rounded bg-slate-100 px-1">SETUP_CODE</code> with a value only you know, then redeploy and reload this page.</p>
      </Shell>
    )
  }
  return (
    <Shell title="Create the admin account" sub="First visit. Only someone with the setup code can do this.">
      <form className="grid gap-3" onSubmit={submit}>
        <Field label="Your name" value={f.name} onChange={set('name')} autoFocus />
        <Field label="Email" type="email" autoComplete="username" value={f.email} onChange={set('email')} />
        <Field label="Password (10+ characters)" type="password" autoComplete="new-password" value={f.password} onChange={set('password')} />
        <Field label="Password again" type="password" autoComplete="new-password" value={f.password2} onChange={set('password2')} />
        <Field label="Setup code (from Vercel settings)" type="password" value={f.code} onChange={set('code')} />
        {err && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
        <button className="btn-primary justify-center !py-2" disabled={busy}><ShieldCheck size={15} /> {busy ? 'Creating…' : 'Create admin'}</button>
      </form>
    </Shell>
  )
}

export function ChangePassword({ forced, onDone, onCancel }) {
  const [f, setF] = useState({ current: '', next: '', next2: '' })
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const submit = async (e) => {
    e.preventDefault(); setErr('')
    if (f.next !== f.next2) return setErr("The two new passwords don't match.")
    setBusy(true)
    try { await api.changePassword({ current: f.current, next: f.next }); onDone() } catch (x) { setErr(x.message) } finally { setBusy(false) }
  }
  const form = (
    <form className="grid gap-3" onSubmit={submit}>
      <Field label={forced ? 'Temporary password' : 'Current password'} type="password" autoComplete="current-password" value={f.current} onChange={set('current')} autoFocus />
      <Field label="New password (10+ characters)" type="password" autoComplete="new-password" value={f.next} onChange={set('next')} />
      <Field label="New password again" type="password" autoComplete="new-password" value={f.next2} onChange={set('next2')} />
      {err && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
      <div className="flex gap-2">
        {onCancel && <button type="button" className="btn-ghost flex-1 justify-center" onClick={onCancel}>Cancel</button>}
        <button className="btn-primary flex-1 justify-center !py-2" disabled={busy}><KeyRound size={15} /> {busy ? 'Saving…' : 'Set password'}</button>
      </div>
    </form>
  )
  return forced ? <Shell title="Choose your password" sub="You're using a temporary password. Pick your own to continue.">{form}</Shell> : form
}
