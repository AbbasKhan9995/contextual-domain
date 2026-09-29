import { useEffect, useState } from 'react'
import { Inbox, Check, X } from 'lucide-react'
import { api, fmtDate, fmtMoney } from '../lib/api.js'

/** Requests clients sent from the portal: real sites and your cost next to
 *  what they were quoted, one click to turn them into pipeline orders. */
export default function RequestsInbox() {
  const [d, setD] = useState(null)
  const [show, setShow] = useState('new')
  const [msg, setMsg] = useState('')
  const load = () => api.requests().then(setD).catch(() => setD({ requests: [], open: 0 }))
  useEffect(() => { load() }, [])
  if (!d || !d.requests.length) return null

  const list = d.requests.filter((r) => show === 'all' || r.status === 'new')
  const convert = async (r) => { const x = await api.convertRequest(r.id); setMsg(`${r.clientName}: ${x.created} orders added to the pipeline${x.skipped ? `, ${x.skipped} skipped` : ''}.`); load() }
  const decline = async (r) => {
    const reply = prompt('Decline this request. Optional message the client will see:', '')
    if (reply === null) return
    await api.updateRequest(r.id, { status: 'declined', reply }); load()
  }

  return (
    <div className="card mb-4 rounded-xl p-4">
      <div className="mb-3 flex items-center gap-2">
        <Inbox size={16} className="text-indigo-600" />
        <h2 className="text-sm font-semibold text-slate-800">Client requests</h2>
        {d.open > 0 && <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-bold text-white">{d.open} new</span>}
        <div className="ml-auto flex rounded-md border border-slate-200 p-0.5 text-xs">
          {[['new', 'New'], ['all', 'All']].map(([k, l]) => <button key={k} className={`rounded px-2 py-0.5 ${show === k ? 'bg-slate-900 text-white' : 'text-slate-600'}`} onClick={() => setShow(k)}>{l}</button>)}
        </div>
      </div>
      {msg && <div className="mb-2 rounded bg-emerald-50 px-3 py-1.5 text-sm text-emerald-800">{msg}</div>}
      {list.length === 0 ? <div className="text-sm text-slate-500">No new requests.</div> : (
        <div className="grid gap-3">
          {list.map((r) => {
            const cost = r.items.reduce((a, i) => a + (i.cost || 0), 0)
            return (
              <div key={r.id} className="rounded-lg border border-slate-200">
                <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2 text-sm">
                  <b>{r.clientName}</b><span className="text-slate-500">· {fmtDate(r.createdAt)} · {r.catalogName}</span>
                  <span className="ml-auto">quoted <b>{fmtMoney(r.total)}</b> · cost {fmtMoney(cost)} · margin <b className="text-emerald-700">{fmtMoney(r.total - cost)}</b></span>
                </div>
                <div className="divide-y divide-slate-50 px-3 text-sm">
                  {r.items.map((i) => (
                    <div key={i.code} className="flex items-center gap-3 py-1">
                      <span className="w-20 font-mono text-xs font-semibold text-indigo-600">{i.code}</span>
                      <span className="min-w-0 flex-1 truncate">{i.name ? <><b>{i.name}</b> <span className="text-slate-500">{i.url}</span></> : <span className="text-rose-600">site no longer in inventory</span>}{i.pending && <span className="ml-2 text-xs text-amber-700" title={i.pendingReason || ''}>now pending</span>}</span>
                      <span className="tabular-nums text-slate-500">{fmtMoney(i.cost)}</span>
                      <span className="w-16 text-right font-semibold tabular-nums">{fmtMoney(i.price)}</span>
                    </div>
                  ))}
                </div>
                {r.note && <div className="border-t border-slate-100 px-3 py-2 text-sm text-slate-600">"{r.note}"</div>}
                <div className="flex items-center gap-2 border-t border-slate-100 px-3 py-2">
                  {r.status === 'new' ? (
                    <>
                      <button className="btn-primary !py-1 text-xs" onClick={() => convert(r)}><Check size={12} /> Accept → create orders</button>
                      <button className="btn-ghost !py-1 text-xs" onClick={() => decline(r)}><X size={12} /> Decline</button>
                    </>
                  ) : <span className="text-xs text-slate-500">{r.status === 'converted' ? `Converted ${fmtDate(r.convertedAt)} · ${r.created} orders` : `Declined${r.reply ? `: "${r.reply}"` : ''}`}</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
