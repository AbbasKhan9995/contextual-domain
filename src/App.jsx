import { useCallback, useEffect, useState } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'
import { LayoutDashboard, Globe, KanbanSquare, Users, FileBarChart, Package, ShieldCheck, BookOpen, PenLine, Settings as SettingsIcon, LogOut } from 'lucide-react'
import { api } from './lib/api.js'
import { SessionContext } from './lib/session.js'
import { Login, Setup, ChangePassword } from './pages/Auth.jsx'
import Portal from './pages/Portal.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Sites from './pages/Sites.jsx'
import Pipeline from './pages/Pipeline.jsx'
import Clients from './pages/Clients.jsx'
import Report from './pages/Report.jsx'
import Bundles from './pages/Bundles.jsx'
import Links from './pages/Links.jsx'
import Catalog from './pages/Catalog.jsx'
import Content from './pages/Content.jsx'
import Settings from './pages/Settings.jsx'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/sites', label: 'Sites', icon: Globe },
  { to: '/bundles', label: 'Bundles', icon: Package },
  { to: '/catalog', label: 'Client catalog', icon: BookOpen },
  { to: '/content', label: 'Content planner', icon: PenLine },
  { to: '/pipeline', label: 'Pipeline', icon: KanbanSquare },
  { to: '/links', label: 'Link monitor', icon: ShieldCheck },
  { to: '/clients', label: 'Clients', icon: Users },
  { to: '/report', label: 'Reports', icon: FileBarChart },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
]

function AdminApp({ session }) {
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col bg-slate-950 text-slate-300 print:hidden">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-emerald-400 text-sm font-black text-white">CD</span>
          <div>
            <div className="text-[15px] font-bold tracking-tight text-white">Contextual Domain</div>
            <div className="text-[11px] text-slate-500">Outreach & placements</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to} to={to} end={end}
              className={({ isActive }) => `mb-0.5 flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium ${isActive ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}
            >
              <Icon size={16} /> {label}
            </NavLink>
          ))}
        </nav>
        {session.authEnabled && (
          <div className="border-t border-white/10 px-4 py-3">
            <div className="truncate text-sm font-medium text-white">{session.user.name}</div>
            <div className="truncate text-[11px] text-slate-500">{session.user.email}</div>
            <button className="mt-2 inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white" onClick={session.logout}><LogOut size={12} /> Log out</button>
          </div>
        )}
      </aside>
      <main className="min-w-0 flex-1 overflow-x-hidden p-6 print:p-0">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/sites" element={<Sites />} />
          <Route path="/bundles" element={<Bundles />} />
          <Route path="/catalog" element={<Catalog />} />
          <Route path="/content" element={<Content />} />
          <Route path="/pipeline" element={<Pipeline />} />
          <Route path="/links" element={<Links />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/report" element={<Report />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Dashboard />} />
        </Routes>
      </main>
    </div>
  )
}

// Who is this? Decides between setup, login, forced password change, the
// client portal and the admin app. Locally (no logins) it goes straight in.
export default function App() {
  const [me, setMe] = useState(null)
  const [err, setErr] = useState('')
  const refresh = useCallback(() => api.me().then((r) => { setMe(r); setErr('') }).catch((e) => setErr(e.message)), [])
  useEffect(() => { refresh() }, [refresh])
  useEffect(() => {
    const on = () => refresh()
    window.addEventListener('gp:unauthorized', on)
    return () => window.removeEventListener('gp:unauthorized', on)
  }, [refresh])
  const logout = async () => { await api.logout().catch(() => {}); window.location.assign('/') }

  if (err) return <div className="flex min-h-screen items-center justify-center p-6 text-sm text-rose-700">Can't reach the server: {err}. <button className="ml-2 underline" onClick={refresh}>Retry</button></div>
  if (!me) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading…</div>
  if (me.needsSetup) return <Setup setupEnabled={me.setupEnabled} onDone={refresh} />
  if (!me.user) return <Login onDone={refresh} />
  if (me.user.mustChangePassword) return <ChangePassword forced onDone={refresh} />

  const session = { ...me, refresh, logout }
  return (
    <SessionContext.Provider value={session}>
      {me.user.role === 'client' ? <Portal /> : <AdminApp session={session} />}
    </SessionContext.Provider>
  )
}
