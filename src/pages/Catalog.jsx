import { useEffect, useMemo, useState } from 'react'
import { BookOpen, Download, ExternalLink, Save, Plus, Trash2, Eye, EyeOff, ClipboardPaste, ShieldCheck, ChevronLeft, ChevronRight } from 'lucide-react'
import { api, fmtMoney } from '../lib/api.js'
import { PageHeader, Empty } from '../components/ui.jsx'
import { AuthorityPill, compact } from '../components/SiteCells.jsx'
import RequestsInbox from '../components/RequestsInbox.jsx'

const PER = 20

export default function Catalog() {
  const [list, setList] = useState([])
  const [defaults, setDefaults] = useState(null)
  const [cat, setCat] = useState(null) // the catalog being edited (saved or not)
  const [pv, setPv] = useState(null)
  const [mine, setMine] = useState(false) // show real domains + costs (app only)
  const [page, setPage] = useState(1)
  const [niches, setNiches] = useState([])
  const [clients, setClients] = useState([])
  const [msg, setMsg] = useState('')
  // Request intake
  const [reqText, setReqText] = useState('')
  const [resolved, setResolved] = useState(null)
  const [reqClient, setReqClient] = useState('')

  const loadList = () => api.catalogs().then((r) => { setList(r.catalogs); setDefaults(r.defaults); return r })
  useEffect(() => {
    loadList().then((r) => setCat(r.catalogs[0] || structuredClone(r.defaults)))
    api.niches().then((r) => setNiches(r.niches))
    api.clients().then((r) => { setClients(r.clients); if (r.clients[0]) setReqClient(r.clients[0].id) })
  }, [])

  // Live preview of the current settings, saved or not.
  useEffect(() => {
    if (!cat) return
    const t = setTimeout(() => api.previewCatalog(cat).then((r) => { setPv(r); setPage(1) }), 250)
    return () => clearTimeout(t)
  }, [cat])

  const set = (group, k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setCat((c) => (group ? { ...c, [group]: { ...c[group], [k]: v } } : { ...c, [k]: v }))
  }
  const save = async () => {
    const r = cat.id ? await api.updateCatalog(cat.id, cat) : await api.addCatalog(cat)
    setCat(r.catalog); loadList(); setMsg(`Saved "${r.catalog.name}".`)
    return r.catalog
  }
  // Always save first, so the file matches what's on screen.
  const exportFile = async () => { const c = await save(); window.location.href = `/api/catalogs/${c.id}/export` }
  const openView = async () => { const c = await save(); window.open(`/api/catalogs/${c.id}/export?view=1`, '_blank', 'noopener') }
  const del = async () => { if (cat.id && confirm(`Delete catalog "${cat.name}"?`)) { await api.deleteCatalog(cat.id); const r = await loadList(); setCat(r.catalogs[0] || structuredClone(r.defaults)) } }

  const resolve = () => api.resolveCodes({ text: reqText, catalogId: cat?.id }).then(setResolved)
  const createOrders = async () => {
    const items = resolved.found.map((f) => ({ siteId: f.siteId, priceAgreed: f.cost, clientPrice: f.price }))
    const r = await api.bulkOrders({ clientId: reqClient, items, note: `From catalog: ${cat?.name || ''}` })
    setMsg(`${r.created} placements added to the pipeline${r.skipped ? `, ${r.skipped} skipped (already in progress for this client)` : ''}.`)
    setResolved(null); setReqText('')
  }

  const rows = pv?.rows || []
  const pages = Math.max(1, Math.ceil(rows.length / PER))
  const shown = rows.slice((page - 1) * PER, page * PER)
  const reqTotals = useMemo(() => resolved && ({ cost: resolved.found.reduce((a, f) => a + (f.cost || 0), 0), price: resolved.found.reduce((a, f) => a + (f.price || 0), 0) }), [resolved])

  if (!cat) return <div className="text-sm text-slate-500">Loading…</div>
  const c = cat.criteria, p = cat.pricing, d = cat.display

  return (
    <div>
      <PageHeader title="Client catalog" sub="Your inventory as clients see it: resale prices, no domains, one file to send">
        <select className="input w-56" value={cat.id || ''} onChange={(e) => setCat(e.target.value ? list.find((x) => x.id === e.target.value) : structuredClone(defaults))}>
          {list.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.count})</option>)}
          <option value="">+ New catalog</option>
        </select>
        <button className="btn-ghost" onClick={openView}><ExternalLink size={14} /> Open as client</button>
        <button className="btn-primary" onClick={exportFile}><Download size={14} /> Export HTML</button>
      </PageHeader>
      {msg && <div className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</div>}
      <RequestsInbox />

      <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
        <div className="card h-fit rounded-xl p-4">
          <div className="grid gap-3">
            <div><label className="label">Catalog name</label><input className="input" value={cat.name} onChange={set(null, 'name')} /></div>
            <div><label className="label">Intro shown to the client</label><textarea className="input h-20" value={cat.intro} onChange={set(null, 'intro')} /></div>
            <div><label className="label">Your email (for the client's "Email request" button)</label><input className="input" value={cat.contactEmail} onChange={set(null, 'contactEmail')} placeholder="you@yourdomain.com" /></div>

            <div className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-400">Which sites</div>
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2"><label className="label">Niche</label>
                <select className="input" value={c.niche} onChange={set('criteria', 'niche')}><option value="">All niches</option>{niches.map((n) => <option key={n.name} value={n.name}>{n.name} ({n.count})</option>)}</select>
              </div>
              <div><label className="label">Min DR</label><input className="input" type="number" value={c.minDr} onChange={set('criteria', 'minDr')} /></div>
              <div><label className="label">Min traffic</label><input className="input" value={c.minTraffic} onChange={set('criteria', 'minTraffic')} placeholder="1K" /></div>
              <div><label className="label">Link type</label>
                <select className="input" value={c.follow} onChange={set('criteria', 'follow')}><option value="">Any</option><option value="dofollow">Dofollow only</option></select>
              </div>
              <div><label className="label">Max cost $</label><input className="input" type="number" value={c.maxCost} onChange={set('criteria', 'maxCost')} /></div>
              <label className="col-span-2 flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={c.excludeFlagged} onChange={set('criteria', 'excludeFlagged')} /> Leave out flagged sites</label>
              <label className="col-span-2 flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={c.liveOnly} onChange={set('criteria', 'liveOnly')} /> Only sites verified live</label>
            </div>

            <div className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-400">Pricing</div>
            <div className="grid grid-cols-3 gap-2">
              <div><label className="label">Markup ×</label><input className="input" type="number" step="0.1" min="1" value={p.markup} onChange={set('pricing', 'markup')} /></div>
              <div><label className="label">Min margin $</label><input className="input" type="number" min="0" value={p.minMargin} onChange={set('pricing', 'minMargin')} /></div>
              <div><label className="label">Round to $</label>
                <select className="input" value={p.round} onChange={set('pricing', 'round')}>{[1, 5, 10, 25, 50].map((v) => <option key={v} value={v}>{v}</option>)}</select>
              </div>
            </div>

            <div className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-400">What the client sees</div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="label">Publisher name</label>
                <select className="input" value={d.mask} onChange={set('display', 'mask')}><option value="hidden">Hidden (code + .com)</option><option value="partial">Partial (fo•••s.com)</option></select>
              </div>
              <div><label className="label">Traffic</label>
                <select className="input" value={d.traffic} onChange={set('display', 'traffic')}><option value="bucket">Range (100K–500K)</option><option value="exact">Exact number</option></select>
              </div>
              <label className="col-span-2 flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={d.showDa} onChange={set('display', 'showDa')} /> Show Moz DA</label>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <ShieldCheck size={12} className="mr-1 inline text-emerald-600" />
              The exported file contains <b>no domains, names, costs, contacts or notes</b>, only a reference code per site.
              {d.mask === 'partial' && <span className="text-amber-700"> Partial names give away 3 letters plus the ending, and exact traffic plus DR can be enough to identify a site. Use Hidden + Range for the safest file.</span>}
            </div>
            <div className="flex gap-2">
              <button className="btn-primary flex-1 justify-center" onClick={save}><Save size={14} /> {cat.id ? 'Save' : 'Save catalog'}</button>
              {cat.id && <button className="btn-danger" onClick={del} title="Delete catalog"><Trash2 size={14} /></button>}
            </div>
          </div>
        </div>

        <div className="min-w-0">
          <div className="mb-3 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200">
            {[['Publishers offered', pv?.totals.count ?? '…'], ['Median client price', fmtMoney(pv?.totals.medianPrice)], ['Average margin', pv ? `${pv.totals.avgMarginPct}%` : '…']].map(([l, v]) => (
              <div key={l} className="bg-white px-4 py-3"><div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{l}</div><div className="mt-0.5 text-lg font-bold tabular-nums">{v}</div></div>
            ))}
          </div>

          <div className="card overflow-hidden rounded-xl">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2.5">
              <span className="mr-auto text-sm text-slate-500"><BookOpen size={14} className="mr-1 inline" /> {mine ? 'Your view: real sites and costs (never exported)' : 'Client preview: exactly what the file shows'}</span>
              <button className={`btn-ghost !py-1 text-xs ${mine ? '!border-amber-300 !bg-amber-50 !text-amber-800' : ''}`} onClick={() => setMine((v) => !v)}>{mine ? <EyeOff size={13} /> : <Eye size={13} />} {mine ? 'Hide my costs' : 'Show my costs'}</button>
              <div className="flex items-center gap-1 text-sm">
                <button className="btn-ghost !px-2 !py-1" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={14} /></button>
                <span className="px-1 text-xs tabular-nums text-slate-500">{page} / {pages}</span>
                <button className="btn-ghost !px-2 !py-1" disabled={page >= pages} onClick={() => setPage(page + 1)}><ChevronRight size={14} /></button>
              </div>
            </div>
            {rows.length === 0 ? <div className="p-6"><Empty>No sites match these settings.</Empty></div> : (
              <div className="overflow-x-auto">
                <table className="w-full select-none">
                  <thead><tr>
                    <th className="th">Code</th><th className="th">Publisher</th><th className="th">Niche</th><th className="th">DR</th>{d.showDa && <th className="th">DA</th>}
                    <th className="th">Traffic</th><th className="th">Link</th><th className="th">TAT</th>
                    {mine && <><th className="th text-right">Cost</th><th className="th text-right">Margin</th></>}
                    <th className="th text-right">Price</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {shown.map((r) => (
                      <tr key={r.code}>
                        <td className="td font-mono text-xs font-semibold text-indigo-600">{r.code}</td>
                        <td className="td">
                          <div className="font-semibold text-slate-900">{mine ? r.internal.name : r.publisher}</div>
                          <div className="text-xs text-slate-500">{mine ? r.internal.url : [r.country, r.language].filter(Boolean).join(' · ') || ' '}</div>
                        </td>
                        <td className="td max-w-[110px] truncate text-xs text-slate-500" title={r.niches.join(", ")}>{r.niches.slice(0, 2).join(', ')}</td>
                        <td className="td"><AuthorityPill value={r.dr} label="DR" /></td>
                        {d.showDa && <td className="td"><AuthorityPill value={r.da} label="DA" /></td>}
                        <td className="td text-sm tabular-nums text-slate-700">{r.traffic != null ? compact(r.traffic) : r.trafficBand || '—'}</td>
                        <td className="td">{r.follow ? <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.follow === 'dofollow' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>{r.maxLinks ? `${r.maxLinks}× ` : ''}{r.follow === 'dofollow' ? 'Dofollow' : 'Nofollow'}</span> : '—'}</td>
                        <td className="td text-sm text-slate-600">{r.tatDays != null ? `${r.tatDays}d` : '—'}</td>
                        {mine && <><td className="td text-right tabular-nums text-slate-500">{fmtMoney(r.internal.cost)}</td><td className="td text-right tabular-nums text-emerald-700">{fmtMoney(r.price - r.internal.cost)}</td></>}
                        <td className="td text-right text-[15px] font-bold tabular-nums">{fmtMoney(r.price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* A client's reply → pipeline. */}
          <div className="card mt-4 rounded-xl p-4">
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-800"><ClipboardPaste size={15} /> Turn a client's request into orders</div>
            <p className="mb-2 text-xs text-slate-500">Paste the client's email or list. Every GP-XXXXXX code in it is matched to the real site, priced with this catalog's settings, and added to the pipeline for the client you pick.</p>
            <textarea className="input h-24 font-mono text-xs" value={reqText} onChange={(e) => setReqText(e.target.value)} placeholder={'Hi, I would like to order these placements:\nGP-7F3A2C  (Business, DR 81, $190)\n…'} />
            <div className="mt-2 flex items-center gap-2">
              <button className="btn-ghost" disabled={!/GP-[0-9A-F]{6}/i.test(reqText)} onClick={resolve}>Match codes</button>
              {resolved && <span className="text-xs text-slate-500">{resolved.found.length} matched{resolved.missing.length ? `, ${resolved.missing.length} not found (${resolved.missing.join(', ')})` : ''}</span>}
            </div>
            {resolved?.found.length > 0 && (
              <div className="mt-3">
                <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {resolved.found.map((f) => (
                    <div key={f.code} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                      <span className="w-24 font-mono text-xs font-semibold text-indigo-600">{f.code}</span>
                      <span className="flex-1 truncate"><b>{f.name}</b> <span className="text-slate-500">{f.url} · DR {f.dr ?? '—'}</span>{f.flags?.length > 0 && <span className="ml-2 text-xs text-amber-700" title={f.flags.join('\n')}>flagged</span>}{f.live === false && <span className="ml-2 text-xs text-rose-600">site down</span>}</span>
                      <span className="tabular-nums text-slate-500">{fmtMoney(f.cost)}</span>
                      <span className="w-20 text-right font-semibold tabular-nums">{fmtMoney(f.price)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="mr-auto text-sm">Cost <b>{fmtMoney(reqTotals.cost)}</b> · client pays <b>{fmtMoney(reqTotals.price)}</b> · margin <b className="text-emerald-700">{fmtMoney(reqTotals.price - reqTotals.cost)}</b></span>
                  <select className="input !w-56" value={reqClient} onChange={(e) => setReqClient(e.target.value)}>
                    {clients.length === 0 && <option value="">Add a client first (Clients page)</option>}
                    {clients.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                  <button className="btn-primary" disabled={!reqClient} onClick={createOrders}><Plus size={14} /> Add {resolved.found.length} to pipeline</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
