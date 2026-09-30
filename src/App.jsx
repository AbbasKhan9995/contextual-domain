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

import { ThemeToggle } from './lib/theme.jsx'

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
    <div className="flex min-h-screen bg-[#f4f5f9] dark:bg-[#0b0f19] text-slate-800 dark:text-slate-100 transition-colors">
      <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col bg-slate-950 text-slate-300 print:hidden z-30 shadow-xl">
        <a
          href="https://contextualdomain.com"
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center gap-2.5 px-5 py-5 transition hover:opacity-95"
          title="Go to contextualdomain.com"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-emerald-400 text-sm font-black text-white shadow-md transition-transform duration-200 group-hover:scale-105">CD</span>
          <div>
            <div className="text-[15px] font-bold tracking-tight text-white transition-colors group-hover:text-indigo-300">Contextual Domain</div>
            <div className="text-[11px] text-slate-400">Outreach & placements</div>
          </div>
        </a>
        <nav className="flex-1 overflow-y-auto px-3">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to} to={to} end={end}
              className={({ isActive }) => `mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 ${isActive ? 'bg-white/10 text-white shadow-xs font-semibold' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}
            >
              <Icon size={16} /> {label}
            </NavLink>
          ))}
        </nav>
        {session.authEnabled && (
          <div className="border-t border-white/10 px-4 py-3">
            <div className="truncate text-sm font-medium text-white">{session.user.name}</div>
            <div className="truncate text-[11px] text-slate-400">{session.user.email}</div>
            <button className="mt-2 inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors" onClick={session.logout}><LogOut size={12} /> Log out</button>
          </div>
        )}
      </aside>
      <div className="min-w-0 flex-1 flex flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-200/80 bg-white/85 px-6 backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/85 print:hidden transition-colors shadow-xs">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-bold tracking-wide text-indigo-600 dark:text-indigo-400">Contextual Domain</span>
            <span className="text-slate-300 dark:text-slate-700">/</span>
            <span className="font-medium text-slate-500 dark:text-slate-400">Management Platform</span>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
          </div>
        </header>
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
