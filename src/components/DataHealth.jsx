import { useEffect, useRef, useState } from 'react'
import { Play, Square, RotateCw } from 'lucide-react'
import { api } from '../lib/api.js'
import { Modal } from './ui.jsx'

// Fields the free site check can fill, vs ones that need a paid data source or
// the vendor. Shown so a low number reads as "known gap", not "bug".
const CHECK_FILLS = new Set(['Country', 'Language', 'Site checked'])
const NEEDS_SOURCE = { DA: 'Moz', DR: 'Ahrefs', Traffic: 'Ahrefs / Semrush', 'Sample post': 'vendor', Indexed: 'Google (site: search)' }

export default function DataHealth({ onClose, onChanged }) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [job, setJob] = useState(null) // { running, total, done, live, down, unknown, stopped, finishedAt }
  const stopRef = useRef(false)

  const load = () => api.enrich().then(setData).catch((e) => setErr(e.message))
  useEffect(() => { load() }, []) // eslint-disable-line
  useEffect(() => () => { stopRef.current = true }, []) // closing the panel stops the loop

  // The check runs as a series of short batches (so it fits a hosted
  // server's time limit). This panel drives the loop; closing it pauses,
  // and the next start carries on where it stopped.
  const start = async (scope) => {
    setErr(''); stopRef.current = false
    const before = scope === 'all' ? new Date().toISOString() : scope === 'stale' ? new Date(Date.now() - 30 * 864e5).toISOString() : '1970-01-01'
    let j = { running: true, total: null, done: 0, live: 0, down: 0, unknown: 0 }
    setJob(j)
    try {
      while (!stopRef.current) {
        const r = await api.enrichBatch(before)
        j = { ...j, total: j.total ?? r.checked + r.remaining, done: j.done + r.checked, live: j.live + r.live, down: j.down + r.down, unknown: j.unknown + r.unknown }
        setJob(j)
        if (!r.remaining || !r.checked) break
        if (j.done % 90 < 30) load() // refresh the bars every few batches
      }
    } catch (e) { setErr(e.message) }
    setJob({ ...j, running: false, stopped: stopRef.current, finishedAt: new Date().toISOString() })
    load(); onChanged?.()
  }
  const stop = () => { stopRef.current = true }

  const cov = data?.coverage
  return (
    <Modal title="Data health" onClose={onClose} wide>
      {!cov ? <p className="text-sm text-slate-500">Loading…</p> : (
        <div className="space-y-5">
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-sm font-semibold text-slate-800">How complete is the inventory?</h3>
              <span className="text-xs text-slate-500">{cov.total.toLocaleString()} sites</span>
            </div>
            <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {Object.entries(cov.fields).map(([k, v]) => (
                <div key={k} className="flex items-center gap-2 text-sm">
                  <span className="w-32 shrink-0 text-slate-600">{k}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded bg-slate-100">
                    <div className={`h-full ${v.pct >= 80 ? 'bg-emerald-500' : v.pct >= 50 ? 'bg-amber-400' : 'bg-rose-400'}`} style={{ width: `${v.pct}%` }} />
                  </div>
                  <span className="w-10 text-right tabular-nums text-slate-700">{v.pct}%</span>
                  <span className="w-20 truncate text-[11px] text-slate-400" title={NEEDS_SOURCE[k] ? `Needs ${NEEDS_SOURCE[k]}` : ''}>
                    {CHECK_FILLS.has(k) ? 'site check' : NEEDS_SOURCE[k] ? `needs ${NEEDS_SOURCE[k]}` : 'from sheet'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 text-center">
            {[['Live', cov.live.yes, 'text-emerald-700'], ['Down / parked', cov.live.no, 'text-rose-600'], ['Unverified', cov.live.unknown, 'text-slate-600'], ['Flagged', cov.flagged, 'text-amber-600']].map(([l, n, c]) => (
              <div key={l} className="rounded-md border border-slate-200 py-2">
                <div className={`text-lg font-semibold tabular-nums ${c}`}>{n.toLocaleString()}</div>
                <div className="text-[11px] uppercase tracking-wide text-slate-500">{l}</div>
              </div>
            ))}
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <h3 className="mb-1 text-sm font-semibold text-slate-800">Site check</h3>
            <p className="mb-3 text-xs text-slate-500">
              Opens each site's homepage and records whether it loads, whether it redirects to another domain, whether it's a parked
              "domain for sale" page, and the language the page declares (which also gives a country hint, e.g. en-GB). Runs in batches of 30 while this panel is open
              (about 10–15 minutes for the whole list). Closing the panel pauses it; starting again carries on. "Unverified" means the site's firewall blocked the check. That's not the same as being down.
            </p>
            {job?.running ? (
              <div className="flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded bg-slate-200"><div className="h-full bg-indigo-500 transition-all" style={{ width: `${job.total ? (job.done / job.total) * 100 : 0}%` }} /></div>
                <span className="text-sm tabular-nums text-slate-700">{job.done}/{job.total ?? '…'}</span>
                <button className="btn-danger" onClick={stop}><Square size={13} /> Stop</button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <button className="btn-primary" onClick={() => start('unchecked')}><Play size={13} /> Check unchecked sites</button>
                <button className="btn-ghost" onClick={() => start('stale')}><RotateCw size={13} /> Re-check older than 30 days</button>
                <button className="btn-ghost" onClick={() => { if (confirm('Re-check every site? Takes a few minutes.')) start('all') }}>Re-check all</button>
                {job?.finishedAt && <span className="text-xs text-slate-500">Last run: {job.done} checked · {job.live} live · {job.down} down · {job.unknown} unverified{job.stopped ? ' (stopped)' : ''}</span>}
              </div>
            )}
            {err && <p className="mt-2 text-sm text-rose-600">{err}</p>}
          </div>
        </div>
      )}
    </Modal>
  )
}
