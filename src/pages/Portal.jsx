import { useEffect, useMemo, useState } from 'react'
import { BookOpen, ListChecks, Inbox, LogOut, KeyRound, ExternalLink, Check, Plus, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { api, fmtDate, fmtMoney } from '../lib/api.js'
import { useSession } from '../lib/session.js'
import { Modal, Empty } from '../components/ui.jsx'
import { AuthorityPill, compact } from '../components/SiteCells.jsx'
import { LinkVerdict } from '../components/LinkVerdict.jsx'
import { ChangePassword } from './Auth.jsx'

// What a client sees: the catalog (codes, never domains or your costs),
// their orders and their requests. All data comes from /api/portal/*, which
// only ever returns client-safe fields.

const PER = 20
const STAGE_CLS = { Booked: 'bg-slate-100 text-slate-700', 'With publisher': 'bg-indigo-100 text-indigo-700', Published: 'bg-emerald-100 text-emerald-800', 'Being replaced': 'bg-amber-100 text-amber-800' }

function CatalogView({ onRequested }) {
  const [cats, setCats] = useState(null)
  const [catId, setCatId] = useState('')
  const [f, setF] = useState({ q: '', niche: '', minDr: '', maxPrice: '', dof: true, sort: 'dr' })
  const [sel, setSel] = useState({})
  const [page, setPage] = useState(1)
  const [confirm, setConfirm] = useState(false)
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState(''), [err, setErr] = useState('')

  useEffect(() => { api.portalCatalogs().then((r) => { setCats(r.catalogs); setCatId(r.catalogs[0]?.id || '') }) }, [])
  const cat = cats?.find((c) => c.id === catId)
  const niches = useMemo(() => [...new Set((cat?.rows || []).flatMap((r) => r.niches))].sort(), [cat])
  const list = useMemo(() => {
    if (!cat) return []
    const q = f.q.trim().toLowerCase()
    const out = cat.rows.filter((r) => (!q || r.code.toLowerCase().includes(q) || r.niches.join(' ').toLowerCase().includes(q))
      && (!f.niche || r.niches.includes(f.niche)) && (!f.minDr || (r.dr || 0) >= Number(f.minDr))
      && (!f.maxPrice || r.price <= Number(f.maxPrice)) && (!f.dof || r.follow === 'dofollow'))
    const key = { dr: (r) => -(r.dr || 0), traffic: (r) => -r.trafficSort, price: (r) => r.price, tat: (r) => r.tatDays ?? 999 }[f.sort]
    return out.sort((a, b) => key(a) - key(b))
  }, [cat, f])
  useEffect(() => setPage(1), [f, catId])
  const pages = Math.max(1, Math.ceil(list.length / PER))
  const shown = list.slice((page - 1) * PER, page * PER)
  const picked = Object.values(sel)
  const total = picked.reduce((a, r) => a + r.price, 0)
  const toggle = (r) => setSel((s) => { const n = { ...s }; if (n[r.code]) delete n[r.code]; else n[r.code] = r; return n })

  const send = async () => {
    setErr('')
    try {
      await api.portalRequest({ catalogId: catId, codes: picked.map((r) => r.code), note })
      setSel({}); setNote(''); setConfirm(false); setMsg('Request sent. We will confirm availability and get started.')
      onRequested?.()
    } catch (e) { setErr(e.message) }
  }

  if (!cats) return <div className="text-sm text-slate-500">Loading…</div>
  if (!cats.length) return <Empty>No catalog has been shared with you yet.</Empty>
  return (
    <div className="pb-24">
      {cats.length > 1 && (
        <div className="mb-3 flex gap-1">{cats.map((c) => <button key={c.id} onClick={() => setCatId(c.id)} className={`rounded-full px-3 py-1 text-sm ${c.id === catId ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>{c.name}</button>)}</div>
      )}
      {cat.intro && <p className="mb-4 max-w-3xl text-sm text-slate-600">{cat.intro}</p>}
      {msg && <div className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</div>}
      <div className="card mb-3 flex flex-wrap items-end gap-2 rounded-xl px-4 py-3">
        <div className="min-w-[180px] flex-1"><label className="label">Search</label><input className="input" placeholder="niche or code" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></div>
        <div><label className="label">Niche</label><select className="input" value={f.niche} onChange={(e) => setF({ ...f, niche: e.target.value })}><option value="">All</option>{niches.map((n) => <option key={n}>{n}</option>)}</select></div>
        <div className="w-24"><label className="label">Min DR</label><input className="input" type="number" value={f.minDr} onChange={(e) => setF({ ...f, minDr: e.target.value })} /></div>
        <div className="w-28"><label className="label">Max price $</label><input className="input" type="number" value={f.maxPrice} onChange={(e) => setF({ ...f, maxPrice: e.target.value })} /></div>
        <div><label className="label">Sort</label><select className="input" value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value })}><option value="dr">Highest DR</option><option value="traffic">Most traffic</option><option value="price">Lowest price</option><option value="tat">Fastest</option></select></div>
        <label className="flex items-center gap-1.5 pb-2 text-sm text-slate-600"><input type="checkbox" checked={f.dof} onChange={(e) => setF({ ...f, dof: e.target.checked })} /> Dofollow only</label>
      </div>
      <div className="card overflow-hidden rounded-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2 text-sm text-slate-500">
          <span>{list.length} publishers</span>
          <span className="flex items-center gap-1">
            <button className="btn-ghost !px-2 !py-1" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={14} /></button>
            <span className="px-1 text-xs tabular-nums">{page} / {pages}</span>
            <button className="btn-ghost !px-2 !py-1" disabled={page >= pages} onClick={() => setPage(page + 1)}><ChevronRight size={14} /></button>
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full select-none">
            <thead><tr><th className="th"></th><th className="th">Code</th><th className="th">Publisher</th><th className="th">Niche</th><th className="th">DR</th>{cat.showDa && <th className="th">DA</th>}<th className="th">Traffic / mo</th><th className="th">Link</th><th className="th">Turnaround</th><th className="th text-right">Price</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map((r) => {
                const on = !!sel[r.code]
                return (
                  <tr key={r.code} className={on ? 'bg-indigo-50/60' : ''}>
                    <td className="td"><button onClick={() => toggle(r)} className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold ${on ? 'bg-indigo-600 text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>{on ? <><Check size={12} /> Added</> : <><Plus size={12} /> Add</>}</button></td>
                    <td className="td font-mono text-xs font-semibold text-indigo-600">{r.code}</td>
                    <td className="td"><div className="font-semibold text-slate-900">{r.publisher}</div><div className="text-xs text-slate-500">{[r.country, r.language].filter(Boolean).join(' · ') || ' '}</div></td>
                    <td className="td max-w-[160px] truncate text-xs text-slate-500">{r.niches.slice(0, 2).join(', ')}</td>
                    <td className="td"><AuthorityPill value={r.dr} label="DR" /></td>
                    {cat.showDa && <td className="td"><AuthorityPill value={r.da} label="DA" /></td>}
                    <td className="td text-sm text-slate-700">{r.traffic != null ? compact(r.traffic) : r.trafficBand || '—'}</td>
                    <td className="td">{r.follow ? <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.follow === 'dofollow' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>{r.follow === 'dofollow' ? 'Dofollow' : 'Nofollow'}</span> : '—'}</td>
                    <td className="td text-sm text-slate-600">{r.tatDays != null ? `${r.tatDays < 1 ? '<1' : r.tatDays} days` : '—'}</td>
                    <td className="td text-right text-[15px] font-bold tabular-nums">{fmtMoney(r.price)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-500">Publisher names are shared once an article is live. DR and traffic are Ahrefs figures as listed by each publisher; DA is Moz. Prices are per published article.</p>

      {picked.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 bg-slate-900 px-4 py-3 text-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
            <span className="text-sm"><b className="text-lg">{picked.length}</b> selected · <b className="text-lg">{fmtMoney(total)}</b></span>
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-400">{picked.map((r) => r.code).join(', ')}</span>
            <button className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm" onClick={() => setSel({})}>Clear</button>
            <button className="rounded-lg bg-white px-4 py-1.5 text-sm font-bold text-slate-900" onClick={() => setConfirm(true)}>Request these</button>
          </div>
        </div>
      )}
      {confirm && (
        <Modal title="Send placement request" onClose={() => setConfirm(false)}>
          <div className="mb-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {picked.map((r) => (
              <div key={r.code} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                <span className="font-mono text-xs font-semibold text-indigo-600">{r.code}</span>
                <span className="flex-1 truncate text-slate-600">{r.niches[0]} · DR {r.dr ?? '—'}</span>
                <span className="font-semibold tabular-nums">{fmtMoney(r.price)}</span>
                <button className="text-slate-400 hover:text-rose-600" onClick={() => toggle(r)}><X size={13} /></button>
              </div>
            ))}
          </div>
          <label className="label">Notes for us (pages to link to, topics, deadlines)</label>
          <textarea className="input h-24" value={note} onChange={(e) => setNote(e.target.value)} />
          {err && <div className="mt-2 rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
          <div className="mt-4 flex items-center justify-between">
            <span className="text-sm">Total <b>{fmtMoney(total)}</b></span>
            <div className="flex gap-2"><button className="btn-ghost" onClick={() => setConfirm(false)}>Back</button><button className="btn-primary" disabled={!picked.length} onClick={send}>Send request</button></div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function OrdersView() {
  const [d, setD] = useState(null)
  useEffect(() => { api.portalOrders().then((r) => setD(r.orders)) }, [])
  if (!d) return <div className="text-sm text-slate-500">Loading…</div>
  if (!d.length) return <Empty>No placements yet. Pick publishers in the catalog and send a request.</Empty>
  const live = d.filter((o) => o.stage === 'Published')
  return (
    <div>
      <div className="mb-4 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200">
        {[['Placements', d.length], ['Published', live.length], ['Links verified live', live.filter((o) => o.link === 'ok').length]].map(([l, v]) => (
          <div key={l} className="bg-white px-4 py-3"><div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{l}</div><div className="mt-0.5 text-2xl font-bold tabular-nums">{v}</div></div>
        ))}
      </div>
      <div className="card overflow-x-auto rounded-xl">
        <table className="w-full">
          <thead><tr><th className="th">Publisher</th><th className="th">Article</th><th className="th">Links to</th><th className="th">Stage</th><th className="th">Link status</th><th className="th text-right">Price</th><th className="th">Date</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {d.map((o) => (
              <tr key={o.id}>
                <td className="td"><div className="font-semibold text-slate-900">{o.publisher}</div><div className="text-xs text-slate-500">DR {o.dr ?? '—'}</div></td>
                <td className="td max-w-[260px] !whitespace-normal text-sm text-slate-700">{o.articleTitle || <span className="text-slate-400">topic being planned</span>}{o.publishedUrl && <a href={o.publishedUrl} target="_blank" rel="noreferrer" className="mt-0.5 flex items-center gap-1 text-xs text-indigo-600 hover:underline"><ExternalLink size={10} /> Read the article</a>}</td>
                <td className="td max-w-[200px] truncate text-xs text-slate-500">{o.targetUrl.replace(/^https?:\/\//, '') || '—'}{o.anchorText && <div className="text-slate-400">"{o.anchorText}"</div>}</td>
                <td className="td"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STAGE_CLS[o.stage] || ''}`}>{o.stage}</span></td>
                <td className="td">{o.link ? <><LinkVerdict verdict={o.link} clientFacing />{o.linkCheckedAt && <div className="mt-0.5 text-[10px] text-slate-400">checked {fmtDate(o.linkCheckedAt)}</div>}</> : <span className="text-xs text-slate-300">—</span>}</td>
                <td className="td text-right font-semibold tabular-nums">{fmtMoney(o.price)}</td>
                <td className="td text-xs text-slate-500">{o.publishedAt ? `live ${fmtDate(o.publishedAt)}` : o.deadlineAt ? `due ${fmtDate(o.deadlineAt)}` : `booked ${fmtDate(o.createdAt)}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RequestsView() {
  const [d, setD] = useState(null)
  useEffect(() => { api.portalRequests().then((r) => setD(r.requests)) }, [])
  if (!d) return <div className="text-sm text-slate-500">Loading…</div>
  if (!d.length) return <Empty>No requests sent yet.</Empty>
  const label = { new: ['Received', 'bg-sky-100 text-sky-700'], converted: ['Confirmed', 'bg-emerald-100 text-emerald-800'], declined: ['Declined', 'bg-slate-100 text-slate-600'] }
  return (
    <div className="grid gap-3">
      {d.map((r) => (
        <div key={r.id} className="card rounded-xl p-4">
          <div className="mb-2 flex items-center gap-3">
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${label[r.status]?.[1]}`}>{label[r.status]?.[0]}</span>
            <span className="text-sm text-slate-500">{fmtDate(r.createdAt)} · {r.catalogName}</span>
            <span className="ml-auto font-bold tabular-nums">{fmtMoney(r.total)}</span>
          </div>
          <div className="font-mono text-xs text-slate-600">{r.items.map((i) => `${i.code} (${fmtMoney(i.price)})`).join(' · ')}</div>
          {r.note && <div className="mt-2 text-sm text-slate-600">"{r.note}"</div>}
          {r.reply && <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700"><b>Reply:</b> {r.reply}</div>}
        </div>
      ))}
    </div>
  )
}

export default function Portal() {
  const session = useSession()
  const [tab, setTab] = useState('catalog')
  const [pw, setPw] = useState(false)
  const tabs = [['catalog', 'Catalog', BookOpen], ['orders', 'My placements', ListChecks], ['requests', 'My requests', Inbox]]
  return (
    <div className="min-h-screen">
      <header className="bg-slate-950 text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
          <span className="flex items-center gap-2 font-bold"><span className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500 to-emerald-400 text-xs font-black">CD</span> Contextual Domain</span>
          <nav className="flex gap-1">
            {tabs.map(([k, l, Icon]) => <button key={k} onClick={() => setTab(k)} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${tab === k ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'}`}><Icon size={14} /> {l}</button>)}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-slate-400">{session.client?.name || session.user.name}</span>
            <button className="text-slate-400 hover:text-white" title="Change password" onClick={() => setPw(true)}><KeyRound size={15} /></button>
            <button className="inline-flex items-center gap-1 text-slate-400 hover:text-white" onClick={session.logout}><LogOut size={14} /> Log out</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <h1 className="mb-4 text-xl font-bold text-slate-900">{tabs.find(([k]) => k === tab)[1]}</h1>
        {tab === 'catalog' && <CatalogView onRequested={() => {}} />}
        {tab === 'orders' && <OrdersView />}
        {tab === 'requests' && <RequestsView />}
      </main>
      {pw && <Modal title="Change password" onClose={() => setPw(false)}><ChangePassword onDone={() => setPw(false)} onCancel={() => setPw(false)} /></Modal>}
    </div>
  )
}
