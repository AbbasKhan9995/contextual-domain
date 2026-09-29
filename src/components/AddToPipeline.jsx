import { useEffect, useState } from 'react'
import { Modal } from './ui.jsx'
import { api, fmtPrice } from '../lib/api.js'

export default function AddToPipeline({ site, onClose, onDone }) {
  const [clients, setClients] = useState([])
  const [clientId, setClientId] = useState('')
  const [type, setType] = useState('guest_post')
  const [price, setPrice] = useState(site.priceGuestPost || '')
  const [notes, setNotes] = useState('')
  const [clientPrice, setClientPrice] = useState('')
  const [newClient, setNewClient] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { api.clients().then((r) => { setClients(r.clients); if (r.clients[0]) setClientId(r.clients[0].id) }) }, [])
  useEffect(() => { setPrice(type === 'guest_post' ? site.priceGuestPost || '' : site.priceLinkInsert || '') }, [type, site])

  const submit = async () => {
    setBusy(true); setErr('')
    try {
      let cid = clientId
      if (newClient.trim()) cid = (await api.addClient({ name: newClient.trim() })).client.id
      if (!cid) throw new Error('Pick a client or type a new one.')
      await api.addOrder({ siteId: site.id, clientId: cid, type, priceAgreed: price, clientPrice, notes })
      onDone?.(); onClose()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <Modal title={`Add ${site.name} to pipeline`} onClose={onClose}>
      <div className="mb-3 rounded bg-slate-50 px-3 py-2 text-xs text-slate-600">
        {site.url} · DA {site.da ?? '—'} · DR {site.dr ?? '—'} · Guest post {fmtPrice(site.priceGuestPost)} · Link insert {fmtPrice(site.priceLinkInsert)}
      </div>
      <div className="grid gap-3">
        <div>
          <label className="label">Client</label>
          {clients.length > 0 ? (
            <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)} disabled={!!newClient.trim()}>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          ) : <div className="text-xs text-slate-500">No clients yet — type one below.</div>}
          <input className="input mt-2" placeholder="…or add a new client" value={newClient} onChange={(e) => setNewClient(e.target.value)} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">Placement type</label>
            <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="guest_post">Guest post</option>
              <option value="link_insert" disabled={site.priceLinkInsert === 0}>Link insert{site.priceLinkInsert === 0 ? ' (not offered)' : site.priceLinkInsert === null ? ' (price unknown)' : ''}</option>
            </select>
          </div>
          <div>
            <label className="label">Publisher cost ($)</label>
            <input className="input" type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div>
            <label className="label">Client price ($)</label>
            <input className="input" type="number" value={clientPrice} onChange={(e) => setClientPrice(e.target.value)} placeholder="optional" />
          </div>
        </div>
        <div>
          <label className="label">Notes</label>
          <textarea className="input h-20" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Topic idea, contact, anything to remember" />
        </div>
        {err && <div className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy} onClick={submit}>{busy ? 'Adding…' : 'Add to pipeline'}</button>
        </div>
      </div>
    </Modal>
  )
}
