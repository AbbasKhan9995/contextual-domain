import { useCallback, useEffect, useMemo, useState } from 'react'
import { Package, Lock, Unlock, Shuffle, X, Save, Printer, UserPlus, Trash2, Eye, EyeOff, Sparkles } from 'lucide-react'
import { api, fmtMoney, fmtPrice, fmtDate } from '../lib/api.js'
import { PageHeader, Empty } from '../components/ui.jsx'
import { AuthorityPill, TrafficCell, LinkBadge, SiteTile, compact } from '../components/SiteCells.jsx'

// Ready-made tiers, the same shape as the DA50+/60+/70+ packs marketplaces
// sell, but built from our own inventory and priced from real costs.
const TEMPLATES = [
  { name: 'Starter', count: 5, strategy: 'cheapest', criteria: { minDr: 30, follow: 'dofollow' }, blurb: '5 posts · DR 30+ · cheapest' },
  { name: 'Growth', count: 10, strategy: 'value', criteria: { minDr: 50, follow: 'dofollow' }, blurb: '10 posts · DR 50+ · best value' },
  { name: 'Authority', count: 10, strategy: 'value', criteria: { minDr: 70, follow: 'dofollow' }, blurb: '10 posts · DR 70+ · best value' },
  { name: 'Traffic', count: 10, strategy: 'value', criteria: { minDr: 40, minTraffic: '100K', follow: 'dofollow' }, blurb: '10 posts · 100K+ visits · DR 40+' },
  { name: 'Express', count: 10, strategy: 'cheapest', criteria: { minDr: 40, maxTat: 3, follow: 'dofollow' }, blurb: '10 posts · live in ≤ 3 days' },
]
const STRATEGIES = [['value', 'Best value (price vs DR band)'], ['cheapest', 'Cheapest first'], ['dr', 'Highest DR first'], ['traffic', 'Most traffic first']]
const BLANK_CRITERIA = { niche: '', minDr: '', maxDr: '', minDa: '', minTraffic: '', maxPrice: '', maxTat: '', follow: 'dofollow', country: '', excludeFlagged: true, liveOnly: false }

// "forbes.com" → "fo•••s.com": enough for a client to see the tier, not enough
// to go around you and buy direct.
const mask = (d) => { const [name, ...rest] = d.split('.'); return `${name.slice(0, 2)}${'•'.repeat(Math.max(3, name.length - 3))}${name.slice(-1)}.${rest.join('.')}` }
const roundUp = (n, step = 50) => Math.ceil(n / step) * step

export default function Bundles() {
  const [criteria, setCriteria] = useState({ ...BLANK_CRITERIA, minDr: 50 })
  const [count, setCount] = useState(10)
  const [strategy, setStrategy] = useState('value')
  const [lock, setLock] = useState([]) // site ids kept on refresh
  const [exclude, setExclude] = useState([])
  const [pv, setPv] = useState(null)
  const [name, setName] = useState('Growth pack')
  const [markup, setMarkup] = useState(2)
  const [writing, setWriting] = useState(0)
  const [sell, setSell] = useState('')
  const [clientView, setClientView] = useState(false)
  const [niches, setNiches] = useState([])
  const [facets, setFacets] = useState({ countries: [] })
  const [saved, setSaved] = useState([])
  const [clients, setClients] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    api.niches().then((r) => setNiches(r.niches))
    api.facets().then(setFacets)
    api.clients().then((r) => setClients(r.clients))
  }, [])
  const loadSaved = () => api.bundles().then((r) => setSaved(r.bundles))
  useEffect(() => { loadSaved() }, [])

  const preview = useCallback(() => {
    api.previewBundle({ criteria, count, strategy, lock, exclude }).then(setPv).catch((e) => setMsg(e.message))
  }, [criteria, count, strategy, lock, exclude])
  useEffect(() => { preview() }, [preview])

  // Criteria or strategy changes start a fresh pick; count changes keep locks.
  const setC = (k) => (e) => { const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value; setCriteria((c) => ({ ...c, [k]: v })); setLock([]); setExclude([]) }
  const applyTemplate = (t) => { setCriteria({ ...BLANK_CRITERIA, ...t.criteria }); setCount(t.count); setStrategy(t.strategy); setName(`${t.name} pack`); setLock([]); setExclude([]); setEditingId(null); setSell('') }

  const picked = pv?.picked || []
  const cost = picked.reduce((a, s) => a + (s.priceGuestPost || 0), 0)
  const writingTotal = Number(writing || 0) * picked.length
  const suggested = roundUp((cost + writingTotal) * Number(markup || 1))
  const sellPrice = sell === '' ? suggested : Number(sell)
  const margin = sellPrice - cost - writingTotal
  const marginPct = sellPrice ? Math.round((margin / sellPrice) * 100) : 0

  const toggleLock = (id) => setLock((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]))
  // Swap = drop this one, keep every other current pick, let the server fill the gap.
  const swap = (id) => { setLock(picked.map((s) => s.id).filter((x) => x !== id)); setExclude((e) => [...e, id]) }
  const remove = (id) => { setLock(picked.map((s) => s.id).filter((x) => x !== id)); setExclude((e) => [...e, id]); setCount((c) => Math.max(1, c - 1)) }

  const save = async () => {
    const body = { name, criteria, count, strategy, siteIds: picked.map((s) => s.id), sellPrice, writingCost: Number(writing || 0), markup: Number(markup || 1) }
    const r = editingId ? await api.updateBundle(editingId, body) : await api.addBundle(body)
    setEditingId(r.bundle.id); setMsg(`Saved "${r.bundle.name}".`); loadSaved()
  }
  const load = (b) => {
    setCriteria({ ...BLANK_CRITERIA, ...b.criteria }); setStrategy(b.strategy); setCount(b.siteIds.length)
    setLock(b.siteIds); setExclude([]); setName(b.name); setMarkup(b.markup ?? 2); setWriting(b.writingCost ?? 0); setSell(b.sellPrice ?? ''); setEditingId(b.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const assign = async (b, clientId) => {
    if (!clientId) return
    const r = await api.assignBundle(b.id, { clientId })
    setMsg(`${b.name}: ${r.created} placements added to the pipeline${r.skipped ? `, ${r.skipped} skipped (already in progress for this client)` : ''}.`)
    loadSaved()
  }
  const del = async (b) => { if (confirm(`Delete bundle "${b.name}"? Pipeline entries it created stay.`)) { await api.deleteBundle(b.id); if (editingId === b.id) setEditingId(null); loadSaved() } }

  const totals = pv?.totals
  const shortBy = count - picked.length

  return (
    <div>
      <PageHeader title="Bundles" sub="Build packages from the inventory, price them from real costs, sell them to clients">
        <button className={`btn-ghost ${clientView ? '!border-indigo-300 !bg-indigo-50 !text-indigo-700' : ''}`} onClick={() => setClientView((v) => !v)}>
          {clientView ? <EyeOff size={14} /> : <Eye size={14} />} {clientView ? 'Client view on' : 'Client view'}
        </button>
        <button className="btn-ghost" onClick={() => window.print()}><Printer size={14} /> Print / PDF</button>
      </PageHeader>

      {!clientView && (
        <div className="mb-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-5 print:hidden">
          {TEMPLATES.map((t) => (
            <button key={t.name} onClick={() => applyTemplate(t)} className="card rounded-xl px-4 py-3 text-left transition hover:border-indigo-300 hover:shadow-sm">
              <div className="flex items-center gap-2 font-semibold text-slate-900"><Package size={15} className="text-indigo-500" /> {t.name}</div>
              <div className="mt-0.5 text-xs text-slate-500">{t.blurb}</div>
            </button>
          ))}
        </div>
      )}

      <div className={`grid gap-4 ${clientView ? '' : 'xl:grid-cols-[320px_1fr]'}`}>
        {!clientView && (
          <div className="card h-fit rounded-xl p-4 print:hidden">
            <div className="mb-3 text-sm font-semibold text-slate-800">Criteria</div>
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2"><label className="label">Niche</label>
                <select className="input" value={criteria.niche} onChange={setC('niche')}><option value="">Any niche</option>{niches.map((n) => <option key={n.name} value={n.name}>{n.name} ({n.count})</option>)}</select>
              </div>
              <div><label className="label">Min DR</label><input className="input" type="number" value={criteria.minDr} onChange={setC('minDr')} /></div>
              <div><label className="label">Max DR</label><input className="input" type="number" value={criteria.maxDr} onChange={setC('maxDr')} /></div>
              <div><label className="label">Min DA</label><input className="input" type="number" value={criteria.minDa} onChange={setC('minDa')} /></div>
              <div><label className="label">Min traffic</label><input className="input" placeholder="e.g. 50K" value={criteria.minTraffic} onChange={setC('minTraffic')} /></div>
              <div><label className="label">Max $ / post</label><input className="input" type="number" value={criteria.maxPrice} onChange={setC('maxPrice')} /></div>
              <div><label className="label">Max TAT (days)</label><input className="input" type="number" value={criteria.maxTat} onChange={setC('maxTat')} /></div>
              <div><label className="label">Link type</label>
                <select className="input" value={criteria.follow} onChange={setC('follow')}><option value="">Any</option><option value="dofollow">Dofollow</option><option value="nofollow">Nofollow</option></select>
              </div>
              <div><label className="label">Country</label>
                <select className="input" value={criteria.country} onChange={setC('country')}><option value="">Any</option>{facets.countries.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}</select>
              </div>
              <label className="col-span-2 flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={criteria.excludeFlagged} onChange={setC('excludeFlagged')} /> Leave out flagged sites</label>
              <label className="col-span-2 flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={criteria.liveOnly} onChange={setC('liveOnly')} /> Only sites verified live</label>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-4">
              <div><label className="label">Posts</label><input className="input" type="number" min={1} max={100} value={count} onChange={(e) => setCount(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} /></div>
              <div><label className="label">Pick by</label>
                <select className="input" value={strategy} onChange={(e) => { setStrategy(e.target.value); setLock([]); setExclude([]) }}>{STRATEGIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-500">{pv ? `${pv.pool.toLocaleString()} priced sites match. Down and parked sites are always left out.` : '…'}</p>
          </div>
        )}

        <div className="min-w-0">
          <div className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-4 lg:grid-cols-6">
            {[
              ['Posts', `${picked.length}${shortBy > 0 ? ` / ${count}` : ''}`, shortBy > 0 ? `${shortBy} short: loosen criteria` : ''],
              ['Avg DR', totals?.avgDr ?? '—', `DA ${totals?.avgDa ?? '—'}`],
              ['Total traffic', totals ? compact(totals.traffic) : '—', 'visits / month'],
              ['Dofollow', totals ? `${totals.dofollowPct}%` : '—', `median TAT ${totals?.medianTat ?? '—'}d`],
              ...(clientView ? [] : [['Your cost', fmtMoney(cost + writingTotal), writingTotal ? `incl. ${fmtMoney(writingTotal)} writing` : 'publisher fees']]),
              ['Package price', fmtMoney(sellPrice), clientView ? `${fmtMoney(Math.round(sellPrice / Math.max(1, picked.length)))} per post` : `${marginPct}% margin · ${fmtMoney(margin)}`],
            ].map(([l, v, s]) => (
              <div key={l} className="bg-white px-4 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{l}</div>
                <div className={`mt-0.5 text-lg font-bold tabular-nums ${l === 'Package price' && !clientView && margin < 0 ? 'text-rose-600' : 'text-slate-900'}`}>{v}</div>
                <div className={`truncate text-[11px] ${l === 'Posts' && shortBy > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{s}</div>
              </div>
            ))}
          </div>

          {!clientView && (
            <div className="card mb-4 flex flex-wrap items-end gap-2 rounded-xl px-4 py-3 print:hidden">
              <div className="min-w-[180px] flex-1"><label className="label">Bundle name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div className="w-24"><label className="label">Markup ×</label><input className="input" type="number" step="0.1" min="1" value={markup} onChange={(e) => { setMarkup(e.target.value); setSell('') }} /></div>
              <div className="w-28"><label className="label">Writing $ / post</label><input className="input" type="number" min="0" value={writing} onChange={(e) => { setWriting(e.target.value); setSell('') }} /></div>
              <div className="w-32"><label className="label">Sell price $</label><input className="input" type="number" placeholder={String(suggested)} value={sell} onChange={(e) => setSell(e.target.value)} /></div>
              <button className="btn-primary" disabled={!picked.length || !name.trim()} onClick={save}><Save size={14} /> {editingId ? 'Update bundle' : 'Save bundle'}</button>
              {editingId && <button className="btn-ghost" onClick={() => { setEditingId(null); setName(`${name} (copy)`) }}>Save as new</button>}
            </div>
          )}
          {msg && <div className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 print:hidden">{msg} <button className="ml-2 text-emerald-600" onClick={() => setMsg('')}><X size={12} /></button></div>}

          {clientView && <h2 className="mb-2 text-xl font-bold text-slate-900">{name}</h2>}
          {!picked.length ? <Empty>No priced sites match these criteria. Loosen DR, price or link type.</Empty> : (
            <div className="card overflow-x-auto rounded-xl">
              <table className="w-full select-none">
                <thead><tr>
                  <th className="th">#</th><th className="th">Publisher</th><th className="th">DR</th><th className="th">DA</th><th className="th">Traffic</th><th className="th">Link</th><th className="th">TAT</th>
                  {!clientView && <><th className="th text-right">Cost</th><th className="th print:hidden"></th></>}
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {picked.map((s, i) => (
                    <tr key={s.id} className={lock.includes(s.id) && !clientView ? 'bg-indigo-50/40' : ''}>
                      <td className="td text-xs text-slate-400">{i + 1}</td>
                      <td className="td">
                        <div className="flex items-center gap-2.5">
                          {!clientView && <SiteTile s={s} size={28} />}
                          <div>
                            <div className="font-semibold text-slate-900">{clientView ? mask(s.url) : s.name}</div>
                            {clientView && <div className="text-xs text-slate-500">{s.niches.slice(0, 2).join(' · ')}</div>}
                            {!clientView && <div className="text-xs text-slate-500">{s.url} · {s.niches[0]}{s.valueRatio != null && s.valueRatio <= 0.6 && <span className="ml-1.5 rounded bg-emerald-100 px-1 text-[10px] font-bold uppercase text-emerald-800">value</span>}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="td"><AuthorityPill value={s.dr} label="DR" /></td>
                      <td className="td"><AuthorityPill value={s.da} label="DA" /></td>
                      <td className="td"><TrafficCell value={s.traffic} />{!clientView && s.traffic != null && s.traffic < 1000 && <div className="mt-0.5 text-[10px] font-semibold text-amber-600">low traffic</div>}</td>
                      <td className="td"><LinkBadge s={s} /></td>
                      <td className="td text-sm tabular-nums text-slate-600">{s.tatDays != null ? `${s.tatDays}d` : '—'}</td>
                      {!clientView && (
                        <>
                          <td className="td text-right font-semibold tabular-nums">{fmtPrice(s.priceGuestPost)}</td>
                          <td className="td print:hidden">
                            <div className="flex justify-end gap-0.5">
                              <button className={`rounded-md p-1.5 ${lock.includes(s.id) ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-700'} hover:bg-slate-100`} title={lock.includes(s.id) ? 'Locked: kept when the pick refreshes' : 'Lock this site'} onClick={() => toggleLock(s.id)}>{lock.includes(s.id) ? <Lock size={13} /> : <Unlock size={13} />}</button>
                              <button className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Swap for the next best site" onClick={() => swap(s.id)}><Shuffle size={13} /></button>
                              <button className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Remove from bundle" onClick={() => remove(s.id)}><X size={13} /></button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {clientView && <p className="mt-3 text-xs text-slate-500">Publisher domains are shared once the package is confirmed. Metrics are from Ahrefs (DR, traffic) and Moz (DA) as listed by the publisher.</p>}
        </div>
      </div>

      {!clientView && (
        <div className="mt-8 print:hidden">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">Saved bundles</h2>
          {saved.length === 0 ? <Empty>No bundles saved yet. Pick a template above, adjust, and hit <b>Save bundle</b>.</Empty> : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {saved.map((b) => (
                <div key={b.id} className={`card rounded-xl p-4 ${editingId === b.id ? 'border-indigo-300 ring-2 ring-indigo-100' : ''}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-semibold text-slate-900">{b.name}</div>
                      <div className="text-xs text-slate-500">{b.siteIds.length} posts · avg DR {b.totals.avgDr} · saved {fmtDate(b.updatedAt)}</div>
                    </div>
                    <button className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Delete" onClick={() => del(b)}><Trash2 size={13} /></button>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-slate-50 py-1.5"><div className="text-[10px] uppercase text-slate-400">Cost</div><div className="text-sm font-bold tabular-nums">{fmtMoney(b.totals.cost)}</div></div>
                    <div className="rounded-lg bg-slate-50 py-1.5"><div className="text-[10px] uppercase text-slate-400">Sell</div><div className="text-sm font-bold tabular-nums">{fmtMoney(b.sellPrice)}</div></div>
                    <div className="rounded-lg bg-emerald-50 py-1.5"><div className="text-[10px] uppercase text-emerald-600">Margin</div><div className="text-sm font-bold tabular-nums text-emerald-800">{fmtMoney(b.totals.margin)}</div></div>
                  </div>
                  {b.totals.missing > 0 && <div className="mt-2 text-xs text-amber-600">{b.totals.missing} site(s) no longer in the inventory</div>}
                  {b.assignments?.length > 0 && <div className="mt-2 text-xs text-slate-500">Sold to: {b.assignments.map((a) => a.clientName).join(', ')}</div>}
                  <div className="mt-3 flex items-center gap-2">
                    <button className="btn-ghost !py-1 text-xs" onClick={() => load(b)}><Sparkles size={12} /> Open</button>
                    <select className="input !py-1 text-xs" defaultValue="" onChange={(e) => { assign(b, e.target.value); e.target.value = '' }}>
                      <option value="" disabled>Add to a client's pipeline…</option>
                      {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <UserPlus size={14} className="shrink-0 text-slate-400" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
