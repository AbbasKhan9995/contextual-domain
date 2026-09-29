import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, ExternalLink } from 'lucide-react'
import { api, fmtDate } from '../lib/api.js'
import { PageHeader, Empty } from '../components/ui.jsx'
import { LinkVerdict, LinkHistory, VERDICT } from '../components/LinkVerdict.jsx'

const TILES = ['ok', 'changed', 'lost', 'page_down', 'unverified', 'pending']

export default function Links() {
  const [d, setD] = useState(null)
  const [filter, setFilter] = useState('')
  const [clientId, setClientId] = useState('')
  const [err, setErr] = useState('')

  const [job, setJob] = useState(null) // { running, done, total }
  const load = useCallback(() => api.links().then(setD).catch((e) => setErr(e.message)), [])
  useEffect(() => { load() }, [load])

  // Checks go in small batches (a hosted server has a time limit per call);
  // the page keeps asking until nothing is left.
  const run = async (ids) => {
    setErr('')
    let left = ids, done = 0, total = ids?.length ?? null
    setJob({ running: true, done, total })
    try {
      do {
        const r = await api.checkLinks(left)
        done += r.checked; total = total ?? done + r.remaining.length
        left = r.remaining
        setJob({ running: true, done, total })
        await load()
      } while (left.length)
    } catch (e) { setErr(e.message) }
    setJob(null); load()
  }

  if (!d) return <div className="text-sm text-slate-500">Loading…</div>
  const clientsSeen = [...new Map(d.links.filter((o) => o.client).map((o) => [o.client.id, o.client])).values()]
  const rows = d.links.filter((o) => (!filter || o.verdict === filter) && (!clientId || o.client?.id === clientId))
  const tracked = d.links.filter((o) => o.publishedUrl).length

  return (
    <div>
      <PageHeader title="Link monitor" sub={`${tracked} published links tracked · rechecked every ${d.recheckDays} days by the daily check${d.due ? ` · ${d.due} due now` : ''}`}>
        {clientsSeen.length > 1 && (
          <select className="input w-48" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">All clients</option>{clientsSeen.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <button className="btn-primary" disabled={!!job || !tracked} onClick={() => run()}>
          <RefreshCw size={14} className={job ? 'animate-spin' : ''} /> {job ? `Checking ${job.done}/${job.total ?? '…'}…` : 'Check all now'}
        </button>
      </PageHeader>
      {err && <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}

      <div className="mb-4 grid grid-cols-3 gap-2 lg:grid-cols-6">
        {TILES.map((v) => {
          const on = filter === v
          return (
            <button key={v} onClick={() => setFilter(on ? '' : v)} className={`card rounded-xl px-4 py-3 text-left transition ${on ? 'border-slate-900 ring-2 ring-slate-900/10' : 'hover:border-slate-300'}`}>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{VERDICT[v].label}</div>
              <div className={`mt-0.5 text-2xl font-bold tabular-nums ${['lost', 'page_down'].includes(v) && d.summary[v] ? 'text-rose-600' : v === 'changed' && d.summary[v] ? 'text-amber-600' : 'text-slate-900'}`}>{d.summary[v]}</div>
            </button>
          )
        })}
      </div>

      {rows.length === 0 ? (
        <Empty>{d.links.length === 0
          ? <>No published placements yet. When a pipeline card gets a <b>Published URL</b>, it's checked straight away and then every {d.recheckDays} days: is the page up, is the link to the client still there, still dofollow, same anchor, page still indexable.</>
          : 'Nothing matches this filter.'}</Empty>
      ) : (
        <div className="card overflow-x-auto rounded-xl">
          <table className="w-full">
            <thead><tr>
              <th className="th">Publisher</th><th className="th">Client</th><th className="th">Status</th><th className="th">What we found</th>
              <th className="th">Anchor · link</th><th className="th">History</th><th className="th">Checked</th><th className="th"></th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((o) => {
                const c = o.linkCheck
                return (
                  <tr key={o.id} className={['lost', 'page_down'].includes(o.verdict) ? 'bg-rose-50/40' : ''}>
                    <td className="td">
                      <div className="font-semibold text-slate-900">{o.site?.name || 'Deleted site'}</div>
                      {o.publishedUrl ? <a href={o.publishedUrl} target="_blank" rel="noreferrer" className="flex max-w-[220px] items-center gap-1 truncate text-xs text-indigo-600 hover:underline"><ExternalLink size={10} /> {o.publishedUrl.replace(/^https?:\/\//, '')}</a> : <span className="text-xs text-slate-400">add the published URL on the pipeline card</span>}
                    </td>
                    <td className="td text-sm text-slate-700">{o.client?.name}</td>
                    <td className="td"><LinkVerdict verdict={o.verdict} check={c} /></td>
                    <td className="td min-w-[200px] max-w-[260px] !whitespace-normal break-words text-xs text-slate-600">{c?.note || (o.verdict === 'ok' ? `Links to ${c.matchedHref.replace(/^https?:\/\//, '')}` : '—')}{o.linkLostAt && <div className="text-rose-600">first seen missing {fmtDate(o.linkLostAt)}</div>}</td>
                    <td className="td max-w-[180px] !whitespace-normal text-xs">
                      <div className="text-slate-700">{o.anchorText || <span className="text-slate-400">anchor not set</span>}{c?.follow && <span className={`ml-1.5 font-semibold ${c.follow === 'dofollow' ? 'text-emerald-700' : 'text-rose-600'}`}>{c.follow}</span>}</div>
                      {c?.anchorSeen && c.anchorSeen !== o.anchorText && <div className="truncate text-slate-400">on page: {c.anchorSeen}</div>}
                    </td>
                    <td className="td"><LinkHistory history={o.linkHistory} /></td>
                    <td className="td text-xs text-slate-500">{c ? fmtDate(c.checkedAt) : '—'}</td>
                    <td className="td">{o.publishedUrl && <button className="btn-ghost !px-2 !py-1 text-xs" disabled={!!job} onClick={() => run([o.id])} title="Recheck now"><RefreshCw size={12} /></button>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
