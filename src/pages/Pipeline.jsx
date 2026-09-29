import { useCallback, useEffect, useState } from 'react'
import { FileText, CalendarClock } from 'lucide-react'
import { api, fmtDate, fmtMoney } from '../lib/api.js'
import { PageHeader, StageBadge, STAGE_COLOR, Empty } from '../components/ui.jsx'
import OrderDetail from '../components/OrderDetail.jsx'
import { LinkVerdict } from '../components/LinkVerdict.jsx'

// Top-level component (not defined inside Pipeline) so React keeps the same
// instance across re-renders — otherwise every state change remounted the
// card and killed the open stage <select>. The select also sits outside the
// clickable area: a <select> inside a <button> is invalid HTML and the click
// bubbled up to open the detail modal.
function Card({ o, stages, onOpen, onMove }) {
  const today = new Date().toISOString().slice(0, 10)
  const overdue = o.followUpAt && !['Live', 'Rejected'].includes(o.status) && o.followUpAt.slice(0, 10) <= today
  return (
    <div className="card px-3 py-2 hover:border-indigo-300">
      <div role="button" tabIndex={0} className="cursor-pointer" onClick={() => onOpen(o)} onKeyDown={(e) => e.key === 'Enter' && onOpen(o)}>
        <div className="truncate text-sm font-medium text-slate-900">{o.site?.name || 'Deleted site'}</div>
        <div className="truncate text-xs text-slate-500">{o.client?.name} · {o.type === 'link_insert' ? 'Link insert' : 'Guest post'}</div>
        {o.articleTitle && <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-600" title={o.articleTitle}>{o.articleTitle}</div>}
        <div className="mt-1 flex items-center justify-between text-xs">
          <span className="text-slate-500">DR {o.site?.dr ?? '—'}{o.files?.length ? <FileText size={11} className="ml-1 inline text-slate-400" /> : null}</span>
          <span className="font-medium" title={o.margin != null ? `Client ${fmtMoney(o.clientPrice)} · margin ${fmtMoney(o.margin)}` : 'Publisher cost'}>
            {fmtMoney(o.priceAgreed)}{o.margin != null && <span className={`ml-1 text-[10px] ${o.margin < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>+{fmtMoney(o.margin)}</span>}
          </span>
        </div>
        {!['Published', 'Live', 'Rejected'].includes(o.status) && o.readiness && (
          <div className="mt-1.5" title={o.readiness.missing.length ? `Missing: ${o.readiness.missing.join(', ')}` : 'Ready to send to publisher'}>
            <div className="flex h-1 gap-0.5">{Array.from({ length: o.readiness.total }, (_, i) => <span key={i} className={`flex-1 rounded-full ${i < o.readiness.done ? (o.readiness.done === o.readiness.total ? 'bg-emerald-500' : 'bg-indigo-400') : 'bg-slate-200'}`} />)}</div>
          </div>
        )}
        {o.deadlineAt && !['Published', 'Live', 'Rejected'].includes(o.status) && (
          <div className={`mt-1 inline-flex items-center gap-1 text-[11px] ${o.deadlineAt.slice(0, 10) <= today ? 'font-semibold text-rose-600' : 'text-slate-500'}`}><CalendarClock size={10} /> due {fmtDate(o.deadlineAt)}</div>
        )}
        {o.publishedUrl && <div className="mt-1"><LinkVerdict verdict={o.linkCheck?.verdict || 'pending'} check={o.linkCheck} /></div>}
        {o.followUpAt && !['Live', 'Rejected'].includes(o.status) && (
          <div className={`mt-1 text-[11px] ${overdue ? 'text-rose-600' : 'text-slate-400'}`}>follow-up {fmtDate(o.followUpAt)}</div>
        )}
      </div>
      <select className="mt-1.5 w-full rounded border border-slate-200 bg-white px-1 py-0.5 text-[11px]" value={o.status} onChange={(e) => onMove(o, e.target.value)}>
        {stages.map((s) => <option key={s}>{s}</option>)}
      </select>
    </div>
  )
}

export default function Pipeline() {
  const [orders, setOrders] = useState([])
  const [stages, setStages] = useState([])
  const [clients, setClients] = useState([])
  const [clientId, setClientId] = useState('')
  const [view, setView] = useState('board')
  const [open, setOpen] = useState(null)

  const load = useCallback(() => {
    api.orders({ clientId }).then((r) => { setOrders(r.orders); setStages(r.stages) })
    api.clients().then((r) => setClients(r.clients))
  }, [clientId])
  useEffect(() => { load() }, [load])

  const move = async (o, status) => { const r = await api.updateOrder(o.id, { status }); setOrders((os) => os.map((x) => (x.id === o.id ? r.order : x))) }
  const onChange = (updated) => { load(); if (updated) setOpen(updated) }

  return (
    <div>
      <PageHeader title="Pipeline" sub={`${orders.length} placements${clientId ? ' for this client' : ''}`}>
        <select className="input w-52" value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="">All clients</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="flex rounded-md border border-slate-200 bg-white p-0.5 text-xs">
          {['board', 'list'].map((v) => <button key={v} className={`rounded px-2.5 py-1 capitalize ${view === v ? 'bg-slate-900 text-white' : 'text-slate-600'}`} onClick={() => setView(v)}>{v}</button>)}
        </div>
      </PageHeader>

      {orders.length === 0 ? <Empty>Nothing in the pipeline yet. Open <b>Sites</b> and use the board icon on a row to add it for a client.</Empty>
        : view === 'board' ? (
          <div className="flex gap-3 overflow-x-auto overscroll-x-contain pb-3">
            {stages.map((st) => {
              const list = orders.filter((o) => o.status === st)
              return (
                <div key={st} className="w-56 shrink-0 rounded-lg bg-slate-100/70 p-2">
                  <div className="mb-2 flex items-center justify-between px-1">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STAGE_COLOR[st]}`}>{st}</span>
                    <span className="text-xs text-slate-500">{list.length}</span>
                  </div>
                  <div className="grid gap-2">{list.map((o) => <Card key={o.id} o={o} stages={stages} onOpen={setOpen} onMove={move} />)}</div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full">
              <thead><tr><th className="th">Site</th><th className="th">Client</th><th className="th">Article</th><th className="th">Stage</th><th className="th">Ready</th><th className="th">Cost</th><th className="th">Client price</th><th className="th">Margin</th><th className="th">Deadline</th><th className="th">Published</th><th className="th">Updated</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map((o) => (
                  <tr key={o.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setOpen(o)}>
                    <td className="td"><div className="font-medium">{o.site?.name}</div><div className="text-xs text-slate-500">{o.site?.url}</div></td>
                    <td className="td">{o.client?.name}</td>
                    <td className="td max-w-[220px] truncate text-slate-600" title={o.articleTitle}>{o.articleTitle || <span className="text-slate-300">—</span>}</td>
                    <td className="td"><StageBadge status={o.status} /></td>
                    <td className="td tabular-nums text-xs" title={o.readiness?.missing.join(', ')}>
                      <span className={o.readiness?.done === o.readiness?.total ? 'font-semibold text-emerald-700' : 'text-slate-600'}>{o.readiness?.done}/{o.readiness?.total}</span>
                    </td>
                    <td className="td tabular-nums">{fmtMoney(o.priceAgreed)}</td>
                    <td className="td tabular-nums">{fmtMoney(o.clientPrice)}</td>
                    <td className={`td tabular-nums ${o.margin < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{o.margin == null ? '—' : fmtMoney(o.margin)}</td>
                    <td className={`td ${o.deadlineAt && o.deadlineAt.slice(0, 10) <= new Date().toISOString().slice(0, 10) && !['Published', 'Live', 'Rejected'].includes(o.status) ? 'font-semibold text-rose-600' : 'text-slate-600'}`}>{fmtDate(o.deadlineAt)}</td>
                    <td className="td">{o.publishedUrl ? <a href={o.publishedUrl} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline" onClick={(e) => e.stopPropagation()}>link</a> : '—'}</td>
                    <td className="td text-slate-500">{fmtDate(o.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      {open && <OrderDetail order={open} stages={stages} onClose={() => setOpen(null)} onChange={onChange} />}
    </div>
  )
}
