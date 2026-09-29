import { useState } from 'react'
import { Modal } from './ui.jsx'
import { api } from '../lib/api.js'

// Paste-in importer. Accepts the vendor sheet's columns as-is (copy the rows
// including the header line), or any CSV/TSV with url + metrics columns. The
// same /api/import endpoint is what an automated sheet/API feed will post to.
export default function ImportModal({ onClose, onDone, niches }) {
  const [csv, setCsv] = useState('')
  const [niche, setNiche] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [err, setErr] = useState('')

  const run = async () => {
    setBusy(true); setErr(''); setResult(null)
    try {
      const r = await api.importRows({ csv, niche, source: 'paste' })
      setResult(r); onDone?.()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <Modal title="Import sites" onClose={onClose} wide>
      <p className="mb-3 text-sm text-slate-600">
        Paste rows straight from the sheet (select the header row plus the site rows, copy, paste here). Tab- or comma-separated both work.
        Sites already in the list are updated, not duplicated; niches are merged.
      </p>
      <textarea
        className="input h-56 font-mono text-xs"
        placeholder={'Websites Name\tURL\tMOZ DA\tAhrefs DR\tAhrefs Traffic\tGuest Post\tLink Insert\tTAT\tLink Type\tIndex\nHackerNoon\thackernoon.com\t87\t87\t95,548\t$350\tNIL\t7 Days\t2 Do-Follow\tYes'}
        value={csv} onChange={(e) => setCsv(e.target.value)}
      />
      <div className="mt-3 grid grid-cols-[1fr_auto] items-end gap-3">
        <div>
          <label className="label">Niche for these rows (if the rows don't have a Niche column)</label>
          <input className="input" list="niche-list" value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="e.g. Technology, Crypto, Health…" />
          <datalist id="niche-list">{(niches || []).map((n) => <option key={n.name} value={n.name} />)}</datalist>
        </div>
        <button className="btn-primary" disabled={busy || !csv.trim()} onClick={run}>{busy ? 'Importing…' : 'Import'}</button>
      </div>
      {err && <div className="mt-3 rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
      {result && (
        <div className="mt-3 rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Done — {result.added} added, {result.updated} updated, {result.skipped} skipped (no valid domain).
        </div>
      )}
      <details className="mt-4 text-xs text-slate-500">
        <summary className="cursor-pointer">Connecting an automated feed instead</summary>
        <pre className="mt-2 overflow-x-auto rounded bg-slate-50 p-3 text-[11px]">{`POST /api/import
{ "rows": [ { "Websites Name": "…", "URL": "…", "MOZ DA": 80, "Ahrefs DR": 75,
              "Ahrefs Traffic": 120000, "Guest Post": 250, "Link Insert": "NIL",
              "TAT": "72h", "Link Type": "1 Do-Follow", "Index": "Yes", "Niche": "Technology" } ],
  "source": "sheet" }`}</pre>
        Header names are matched loosely (da / moz_da / MOZ DA all work), so a Sheets API script can post the tabs as-is with a Niche column set to the tab name.
      </details>
    </Modal>
  )
}
