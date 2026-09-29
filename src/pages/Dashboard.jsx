import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, fmtDate, fmtMoney } from '../lib/api.js'
import { PageHeader, StageBadge, Empty } from '../components/ui.jsx'
import { LinkVerdict } from '../components/LinkVerdict.jsx'

const Tile = ({ label, value, sub, to }) => {
  const body = (
    <div className="card px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  )
  return to ? <Link to={to} className="block hover:opacity-90">{body}</Link> : body
}

export default function Dashboard() {
  const [s, setS] = useState(null)
  useEffect(() => { api.stats().then(setS) }, [])
  if (!s) return <div className="text-sm text-slate-500">Loading…</div>

  const active = Object.entries(s.byStage).filter(([k]) => !['Live', 'Rejected'].includes(k)).reduce((a, [, v]) => a + v, 0)
  const maxNiche = Math.max(1, ...s.niches.map(([, c]) => c))

  return (
    <div>
      <PageHeader title="Dashboard" sub={s.lastImport ? `Last import ${fmtDate(s.lastImport.at)} (${s.lastImport.source}) · ${s.lastImport.added} added, ${s.lastImport.updated} updated` : 'No imports yet'} />
      <div className="grid grid-cols-5 gap-3">
        <Tile label="Sites in inventory" value={s.sites.toLocaleString()} sub={`avg DR ${s.avgDr}`} to="/sites" />
        <Tile label="Niches" value={s.niches.length} to="/sites" />
        <Tile label="Clients" value={s.clients} to="/clients" />
        <Tile label="Active in pipeline" value={active} sub={`${s.byStage.Live} live · ${s.byStage.Rejected} rejected`} to="/pipeline" />
        <Tile label="Committed spend" value={fmtMoney(s.spend)} sub={s.revenue ? `billed ${fmtMoney(s.revenue)} · margin ${fmtMoney(s.margin)}` : 'accepted + published + live'} to="/pipeline" />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4">
        <div className="card p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Pipeline by stage</h2>
          <div className="grid gap-1.5">
            {Object.entries(s.byStage).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between text-sm">
                <StageBadge status={k} /><span className="font-medium tabular-nums">{v}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Inventory by niche</h2>
          {s.niches.length === 0 ? <div className="text-sm text-slate-500">Nothing imported yet.</div> : (
            <div className="grid gap-1.5">
              {s.niches.map(([n, c]) => (
                <Link key={n} to={`/sites?niche=${encodeURIComponent(n)}`} className="group text-sm">
                  <div className="flex justify-between"><span className="group-hover:text-indigo-700">{n}</span><span className="tabular-nums text-slate-500">{c}</span></div>
                  <div className="mt-0.5 h-1.5 rounded bg-slate-100"><div className="h-1.5 rounded bg-indigo-500" style={{ width: `${(c / maxNiche) * 100}%` }} /></div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {s.openRequests > 0 && <Link to="/catalog" className="mt-4 block rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700">{s.openRequests} new client request{s.openRequests > 1 ? 's' : ''} from the portal. Review in Client catalog →</Link>}
      {s.linkAlerts?.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-rose-700">Link alerts ({s.linkAlerts.length} of {s.linksTracked} published links need attention)</h2>
          <div className="card divide-y divide-slate-100 border-rose-200">
            {s.linkAlerts.map((o) => (
              <Link key={o.id} to="/links" className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-slate-50">
                <div className="min-w-0"><span className="font-medium">{o.site?.name}</span> <span className="text-slate-500">for {o.client?.name}</span><div className="truncate text-xs text-slate-500">{o.linkCheck?.note}</div></div>
                <LinkVerdict verdict={o.linkCheck.verdict} check={o.linkCheck} />
              </Link>
            ))}
          </div>
        </div>
      )}

      {s.deadlines?.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">Deadlines in the next 3 days</h2>
          <div className="card divide-y divide-slate-100">
            {s.deadlines.map((o) => (
              <Link key={o.id} to="/pipeline" className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-slate-50">
                <div className="min-w-0"><span className="font-medium">{o.site?.name}</span> <span className="text-slate-500">for {o.client?.name}</span>{o.articleTitle && <div className="truncate text-xs text-slate-500">{o.articleTitle}</div>}</div>
                <div className="flex items-center gap-3"><span className="text-xs text-slate-500">{o.readiness.done}/{o.readiness.total} ready</span><StageBadge status={o.status} /><span className={`text-xs ${o.deadlineAt.slice(0, 10) <= new Date().toISOString().slice(0, 10) ? 'font-semibold text-rose-600' : 'text-amber-700'}`}>due {fmtDate(o.deadlineAt)}</span></div>
              </Link>
            ))}
          </div>
        </div>
      )}
      {s.unpaidPublishers > 0 && <div className="mt-4 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800">{s.unpaidPublishers} published placement{s.unpaidPublishers > 1 ? 's are' : ' is'} not marked as paid to the publisher. <Link to="/pipeline" className="underline">Open the pipeline</Link></div>}

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Follow-ups due</h2>
        {s.followUps.length === 0 ? <Empty>Nothing due. Set a follow-up date on any pipeline card to see it here.</Empty> : (
          <div className="card divide-y divide-slate-100">
            {s.followUps.map((o) => (
              <Link key={o.id} to="/pipeline" className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-slate-50">
                <div><span className="font-medium">{o.site?.name}</span> <span className="text-slate-500">for {o.client?.name}</span></div>
                <div className="flex items-center gap-3"><StageBadge status={o.status} /><span className="text-xs text-rose-600">due {fmtDate(o.followUpAt)}</span></div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
