import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { api } from '../lib/api.js'
import { PageHeader, Modal, Empty } from '../components/ui.jsx'

function ClientForm({ client, onClose, onDone }) {
  const [f, setF] = useState({ name: client?.name || '', website: client?.website || '', niche: client?.niche || '', notes: client?.notes || '' })
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const submit = async () => {
    try { client ? await api.updateClient(client.id, f) : await api.addClient(f); onDone(); onClose() } catch (e) { setErr(e.message) }
  }
  return (
    <Modal title={client ? `Edit ${client.name}` : 'New client'} onClose={onClose}>
      <div className="grid gap-3">
        <div><label className="label">Name</label><input className="input" value={f.name} onChange={set('name')} autoFocus /></div>
        <div><label className="label">Website</label><input className="input" value={f.website} onChange={set('website')} placeholder="client.com" /></div>
        <div><label className="label">Niche</label><input className="input" value={f.niche} onChange={set('niche')} placeholder="Business licensing, SaaS, …" /></div>
        <div><label className="label">Notes</label><textarea className="input h-20" value={f.notes} onChange={set('notes')} /></div>
        {err && <div className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
        <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={!f.name.trim()} onClick={submit}>Save</button></div>
      </div>
    </Modal>
  )
}

export default function Clients() {
  const [clients, setClients] = useState([])
  const [modal, setModal] = useState(null)
  const load = () => api.clients().then((r) => setClients(r.clients))
  useEffect(() => { load() }, [])
  const del = async (c) => { if (confirm(`Delete ${c.name} and all its pipeline entries?`)) { await api.deleteClient(c.id); load() } }

  return (
    <div>
      <PageHeader title="Clients" sub="Who each placement is for">
        <button className="btn-primary" onClick={() => setModal({})}><Plus size={14} /> New client</button>
      </PageHeader>
      {clients.length === 0 ? <Empty>No clients yet. Add one here, or type a new client name when adding a site to the pipeline.</Empty> : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead><tr><th className="th">Client</th><th className="th">Website</th><th className="th">Niche</th><th className="th">In pipeline</th><th className="th">Live links</th><th className="th"></th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {clients.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="td font-medium">{c.name}</td>
                  <td className="td text-slate-600">{c.website || '—'}</td>
                  <td className="td text-slate-600">{c.niche || '—'}</td>
                  <td className="td"><Link to={`/pipeline`} className="text-indigo-600 hover:underline">{c.orders}</Link></td>
                  <td className="td">{c.live}</td>
                  <td className="td">
                    <div className="flex justify-end gap-1">
                      <Link to={`/report?client=${c.id}`} className="btn-ghost !px-2 !py-1">Report</Link>
                      <button className="btn-ghost !px-2 !py-1" onClick={() => setModal({ client: c })}><Pencil size={14} /></button>
                      <button className="btn-danger !px-2 !py-1" onClick={() => del(c)}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {modal && <ClientForm client={modal.client} onClose={() => setModal(null)} onDone={load} />}
    </div>
  )
}
