import { useState } from 'react'
import { Modal } from './ui.jsx'
import { api } from '../lib/api.js'

const FIELDS = [
  ['name', 'Site name', 'text'], ['url', 'Domain', 'text'],
  ['da', 'Moz DA', 'number'], ['dr', 'Ahrefs DR', 'number'], ['traffic', 'Ahrefs traffic', 'number'],
  ['priceGuestPost', 'Guest post price ($)', 'number'], ['priceLinkInsert', 'Link insert price ($, blank = not offered)', 'number'],
  ['tat', 'Turnaround (TAT)', 'text'], ['linkType', 'Link type', 'text'], ['sampleLink', 'Sample link', 'text'],
  ['contactEmail', 'Contact email', 'text'],
]

export default function SiteForm({ site, onClose, onDone }) {
  const editing = !!site
  const [f, setF] = useState(() => ({
    name: site?.name || '', url: site?.url || '', da: site?.da ?? '', dr: site?.dr ?? '', traffic: site?.traffic ?? '',
    priceGuestPost: site?.priceGuestPost ?? '', priceLinkInsert: site?.priceLinkInsert ?? '', tat: site?.tat || '',
    linkType: site?.linkType || '', sampleLink: site?.sampleLink || '', contactEmail: site?.contactEmail || '',
    niches: (site?.niches || []).join(', '), indexed: site?.indexed === null || site?.indexed === undefined ? '' : site.indexed ? 'yes' : 'no',
    notes: site?.notes || '',
  }))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  const submit = async () => {
    setBusy(true); setErr('')
    try {
      const n = (v) => (v === '' ? null : Number(v))
      const body = {
        name: f.name, url: f.url, da: n(f.da), dr: n(f.dr), traffic: n(f.traffic),
        priceGuestPost: n(f.priceGuestPost), priceLinkInsert: n(f.priceLinkInsert), tat: f.tat, linkType: f.linkType,
        sampleLink: f.sampleLink, contactEmail: f.contactEmail, notes: f.notes,
        niches: f.niches.split(',').map((s) => s.trim()).filter(Boolean),
        indexed: f.indexed === '' ? null : f.indexed === 'yes',
      }
      if (editing) await api.updateSite(site.id, body)
      else await api.addSite({ ...body, niche: body.niches.join(','), Index: f.indexed })
      onDone?.(); onClose()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <Modal title={editing ? `Edit ${site.name}` : 'Add site'} onClose={onClose} wide>
      <div className="grid grid-cols-2 gap-3">
        {FIELDS.map(([k, label, type]) => (
          <div key={k} className={k === 'sampleLink' ? 'col-span-2' : ''}>
            <label className="label">{label}</label>
            <input className="input" type={type} value={f[k]} onChange={set(k)} />
          </div>
        ))}
        <div>
          <label className="label">Niches (comma-separated)</label>
          <input className="input" value={f.niches} onChange={set('niches')} placeholder="Technology, Business" />
        </div>
        <div>
          <label className="label">Indexed</label>
          <select className="input" value={f.indexed} onChange={set('indexed')}>
            <option value="">Unknown</option><option value="yes">Yes</option><option value="no">No</option>
          </select>
        </div>
        <div className="col-span-2">
          <label className="label">Notes</label>
          <textarea className="input h-16" value={f.notes} onChange={set('notes')} />
        </div>
      </div>
      {err && <div className="mt-3 rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={busy || !f.url.trim()} onClick={submit}>{busy ? 'Saving…' : editing ? 'Save' : 'Add site'}</button>
      </div>
    </Modal>
  )
}
