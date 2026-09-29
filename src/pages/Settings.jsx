import { useEffect, useRef, useState } from 'react'
import { UserPlus, KeyRound, Download, Upload, RefreshCw, Trash2, Copy, Check, Database, Cloud } from 'lucide-react'
import { api, fmtDate } from '../lib/api.js'
import { useSession } from '../lib/session.js'
import { PageHeader, Modal } from '../components/ui.jsx'
import { ChangePassword } from './Auth.jsx'

function Card({ title, sub, children, right }) {
  return (
    <div className="card rounded-xl p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div><h2 className="text-sm font-semibold text-slate-800">{title}</h2>{sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}</div>
        {right}
      </div>
      {children}
    </div>
  )
}

/** Shows a new temporary password once, with a copy button. */
function TempPassword({ info, onClose }) {
  const [copied, setCopied] = useState(false)
  const copy = () => navigator.clipboard.writeText(`Login: ${window.location.origin}\nEmail: ${info.email}\nTemporary password: ${info.password}`).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })
  return (
    <Modal title="Login ready" onClose={onClose}>
      <p className="mb-3 text-sm text-slate-600">Send these to <b>{info.email}</b>. The temporary password is shown only now; they'll choose their own at first login.</p>
      <div className="rounded-lg bg-slate-50 px-4 py-3 font-mono text-sm">
        <div>{window.location.origin}</div><div>{info.email}</div><div className="mt-1 text-base font-bold tracking-wide">{info.password}</div>
      </div>
      <div className="mt-4 flex justify-end gap-2"><button className="btn-ghost" onClick={copy}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy all'}</button><button className="btn-primary" onClick={onClose}>Done</button></div>
    </Modal>
  )
}

export default function Settings() {
  const session = useSession()
  const [users, setUsers] = useState([])
  const [clients, setClients] = useState([])
  const [form, setForm] = useState({ email: '', name: '', role: 'client', clientId: '' })
  const [temp, setTemp] = useState(null)
  const [pw, setPw] = useState(false)
  const [msg, setMsg] = useState(''), [err, setErr] = useState('')
  const [syncing, setSyncing] = useState(false)
  const fileRef = useRef(null)

  const load = () => { api.users().then((r) => setUsers(r.users)); api.clients().then((r) => { setClients(r.clients); setForm((f) => ({ ...f, clientId: f.clientId || r.clients[0]?.id || '' })) }) }
  useEffect(() => { load() }, [])
  const flash = (m) => { setMsg(m); setErr(''); setTimeout(() => setMsg(''), 6000) }

  const add = async () => {
    setErr('')
    try { const r = await api.addUser(form); setTemp({ email: r.user.email, password: r.tempPassword }); setForm((f) => ({ ...f, email: '', name: '' })); load() } catch (e) { setErr(e.message) }
  }
  const reset = async (u) => { if (confirm(`Reset the password for ${u.email}? Their current password stops working.`)) { const r = await api.updateUser(u.id, { resetPassword: true }); setTemp({ email: u.email, password: r.tempPassword }); load() } }
  const toggle = async (u) => { try { await api.updateUser(u.id, { disabled: !u.disabled }); load() } catch (e) { setErr(e.message) } }
  const del = async (u) => { if (confirm(`Delete the login ${u.email}?`)) { try { await api.deleteUser(u.id); load() } catch (e) { setErr(e.message) } } }

  const restore = async (file) => {
    setErr('')
    try {
      const data = JSON.parse(await file.text())
      if (!confirm(`Replace the data here with this backup from ${fmtDate(data.exportedAt)}? Sites, orders, clients, bundles, catalogs, content and requests are overwritten. Logins stay as they are.`)) return
      const r = await api.restoreBackup(data)
      flash(`Restored: ${r.restored.join(', ')}.`); load()
    } catch (e) { setErr(e.message.includes('JSON') ? 'That file is not a backup.' : e.message) }
  }
  const sync = async () => {
    setSyncing(true); setErr('')
    try { const r = await api.syncSheet(); flash(`Sheet synced: ${r.total.added} new sites, ${r.total.updated} updated, ${r.tabs.length} tabs read.`) } catch (e) { setErr(e.message) } finally { setSyncing(false) }
  }

  return (
    <div>
      <PageHeader title="Settings" sub={session.authEnabled ? `Signed in as ${session.user.email}` : 'Local install: no logins'} />
      {msg && <div className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</div>}
      {err && <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Logins" sub={session.authEnabled ? 'Admins see everything. Client logins see only the client portal: the catalog (no domains, no costs), their placements and their requests.' : 'Logins switch on when the app is hosted. You can prepare them here.'}>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <input className="input" placeholder="email@client.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <input className="input" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="client">Client (portal)</option><option value="admin">Admin (full access)</option></select>
            {form.role === 'client'
              ? <select className="input" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>{clients.length === 0 && <option value="">Add a client first</option>}{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              : <div />}
          </div>
          <button className="btn-primary" disabled={!form.email || (form.role === 'client' && !form.clientId)} onClick={add}><UserPlus size={14} /> Create login</button>
          <div className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {users.length === 0 && <div className="px-3 py-3 text-sm text-slate-500">No logins yet.</div>}
            {users.map((u) => (
              <div key={u.id} className={`flex items-center gap-3 px-3 py-2 text-sm ${u.disabled ? 'opacity-50' : ''}`}>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-slate-900">{u.name} <span className={`ml-1 rounded px-1.5 py-px text-[10px] font-semibold uppercase ${u.role === 'admin' ? 'bg-slate-900 text-white' : 'bg-indigo-100 text-indigo-700'}`}>{u.role}</span>{u.clientName && <span className="ml-1 text-xs text-slate-500">· {u.clientName}</span>}</div>
                  <div className="truncate text-xs text-slate-500">{u.email} · {u.lastLoginAt ? `last in ${fmtDate(u.lastLoginAt)}` : 'never logged in'}{u.mustChangePassword ? ' · temporary password' : ''}{u.disabled ? ' · disabled' : ''}</div>
                </div>
                <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => reset(u)} title="New temporary password"><KeyRound size={12} /></button>
                {u.id !== session.user.id && <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => toggle(u)}>{u.disabled ? 'Enable' : 'Disable'}</button>}
                {u.id !== session.user.id && <button className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => del(u)}><Trash2 size={13} /></button>}
              </div>
            ))}
          </div>
        </Card>

        <div className="grid h-fit gap-4">
          {session.authEnabled && session.user.id !== 'api' && (
            <Card title="Your password" right={<button className="btn-ghost" onClick={() => setPw(true)}><KeyRound size={14} /> Change</button>} />
          )}
          <Card title="Vendor sheet" sub="Pull the latest sites and prices from the vendor's Google Sheet (same as npm run sync). New sites are added, existing ones updated; nothing is deleted.">
            <button className="btn-primary" disabled={syncing} onClick={sync}><RefreshCw size={14} className={syncing ? 'animate-spin' : ''} /> {syncing ? 'Syncing… (up to a minute)' : 'Sync from sheet'}</button>
          </Card>
          <Card title="Backup and restore" sub="A backup holds sites, orders, clients, bundles, catalogs, content and requests. It never contains logins or passwords. Use it to move data between this PC and the hosted app, or to keep a copy.">
            <div className="flex flex-wrap gap-2">
              <a className="btn-ghost" href="/api/backup"><Download size={14} /> Download backup</a>
              <button className="btn-ghost" onClick={() => fileRef.current?.click()}><Upload size={14} /> Restore from file…</button>
              <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { if (e.target.files[0]) restore(e.target.files[0]); e.target.value = '' }} />
            </div>
          </Card>
          <Card title="This install">
            <div className="grid gap-1.5 text-sm text-slate-600">
              <div className="flex items-center gap-2"><Database size={14} className="text-slate-400" /> Data: <b>{session.mode === 'postgres' ? 'Postgres database' : 'files on this computer (.data folder)'}</b></div>
              <div className="flex items-center gap-2"><Cloud size={14} className="text-slate-400" /> Article files: <b>{session.storage === 'blob' ? 'Vercel Blob' : 'files on this computer'}</b></div>
              <div className="flex items-center gap-2"><KeyRound size={14} className="text-slate-400" /> Logins: <b>{session.authEnabled ? 'on' : 'off (local)'}</b></div>
            </div>
          </Card>
        </div>
      </div>
      {temp && <TempPassword info={temp} onClose={() => setTemp(null)} />}
      {pw && <Modal title="Change password" onClose={() => setPw(false)}><ChangePassword onDone={() => { setPw(false); flash('Password changed.') }} onCancel={() => setPw(false)} /></Modal>}
    </div>
  )
}
