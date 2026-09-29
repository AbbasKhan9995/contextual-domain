import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Printer } from 'lucide-react'
import { api, fmtDate, fmtMoney } from '../lib/api.js'
import { PageHeader, StageBadge, Empty } from '../components/ui.jsx'
import { LinkVerdict } from '../components/LinkVerdict.jsx'

// Client-facing summary of placements: what's live, where, with which anchor.
export default function Report() {
  const [params, setParams] = useSearchParams()
  const [clients, setClients] = useState([])
  const [rep, setRep] = useState(null)
  const clientId = params.get('client') || ''

  useEffect(() => { api.clients().then((r) => { setClients(r.clients); if (!clientId && r.clients[0]) setParams({ client: r.clients[0].id }) }) }, []) // eslint-disable-line
  useEffect(() => { if (clientId) api.report(clientId).then(setRep); else setRep(null) }, [clientId])

  const live = rep?.orders.filter((o) => ['Published', 'Live'].includes(o.status)) || []
  const inProgress = rep?.orders.filter((o) => !['Published', 'Live', 'Rejected'].includes(o.status)) || []
  const spend = live.reduce((a, o) => a + (o.priceAgreed ?? 0), 0)
  const avgDr = live.length ? Math.round(live.reduce((a, o) => a + (o.site?.dr ?? 0), 0) / live.length) : 0

  return (
    <div>
      <PageHeader title="Client report" sub="Placements delivered and in progress">
        <select className="input w-56" value={clientId} onChange={(e) => setParams({ client: e.target.value })}>
          <option value="">Choose a client…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className="btn-ghost" onClick={() => window.print()}><Printer size={14} /> Print / PDF</button>
      </PageHeader>

      {!rep ? <Empty>Pick a client to build the report.</Empty> : (
        <div className="print:text-black">
          <div className="mb-5 grid grid-cols-4 gap-3">
            {[['Live placements', live.length], ['In progress', inProgress.length], ['Avg DR of live links', avgDr], ['Invested', fmtMoney(spend)]].map(([l, v]) => (
              <div key={l} className="card px-4 py-3"><div className="text-xs uppercase tracking-wide text-slate-500">{l}</div><div className="mt-1 text-2xl font-bold">{v}</div></div>
            ))}
          </div>

          <h2 className="mb-2 text-sm font-semibold text-slate-700">Live placements</h2>
          {live.length === 0 ? <Empty>Nothing published yet for {rep.client.name}.</Empty> : (
            <div className="card mb-6 overflow-x-auto">
              <table className="w-full">
                <thead><tr><th className="th">Publisher</th><th className="th">DA / DR</th><th className="th">Anchor text</th><th className="th">Links to</th><th className="th">Published</th><th className="th">Link status</th><th className="th">Article</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {live.map((o) => (
                    <tr key={o.id}>
                      <td className="td"><div className="font-medium">{o.site?.name}</div><div className="text-xs text-slate-500">{o.site?.url}</div>{o.articleTitle && <div className="mt-0.5 max-w-[280px] truncate text-xs italic text-slate-600">{o.articleTitle}</div>}</td>
                      <td className="td tabular-nums">{o.site?.da ?? '—'} / {o.site?.dr ?? '—'}</td>
                      <td className="td">{o.anchorText || '—'}</td>
                      <td className="td max-w-xs truncate text-slate-600">{o.targetUrl || '—'}</td>
                      <td className="td">{fmtDate(o.publishedAt)}</td>
                      <td className="td"><LinkVerdict verdict={o.publishedUrl ? o.linkCheck?.verdict || 'pending' : 'no_url'} clientFacing />{o.linkCheck && <div className="mt-0.5 text-[10px] text-slate-400">checked {fmtDate(o.linkCheck.checkedAt)}</div>}</td>
                      <td className="td">{o.publishedUrl ? <a className="text-indigo-600 hover:underline" href={o.publishedUrl} target="_blank" rel="noreferrer">View</a> : <span className="text-slate-400">pending URL</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {inProgress.length > 0 && (
            <>
              <h2 className="mb-2 text-sm font-semibold text-slate-700">In progress</h2>
              <div className="card overflow-x-auto">
                <table className="w-full">
                  <thead><tr><th className="th">Publisher</th><th className="th">DR</th><th className="th">Stage</th><th className="th">Type</th><th className="th">Last update</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {inProgress.map((o) => (
                      <tr key={o.id}>
                        <td className="td font-medium">{o.site?.name}</td>
                        <td className="td">{o.site?.dr ?? '—'}</td>
                        <td className="td"><StageBadge status={o.status} /></td>
                        <td className="td text-slate-600">{o.type === 'link_insert' ? 'Link insert' : 'Guest post'}</td>
                        <td className="td text-slate-500">{fmtDate(o.updatedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
