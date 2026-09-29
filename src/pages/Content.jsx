import { useCallback, useEffect, useState } from 'react'
import { Plus, ListPlus, Trash2, Link2, Unlink, Sparkles, AlertTriangle, CalendarClock, ExternalLink, FileText } from 'lucide-react'
import { api, fmtDate, fmtMoney } from '../lib/api.js'
import { PageHeader, Modal, Empty } from '../components/ui.jsx'
import { AuthorityPill, TrafficCell, SiteTile } from '../components/SiteCells.jsx'
import { LinkVerdict } from '../components/LinkVerdict.jsx'

const STAGE_COLOR = {
  Idea: 'bg-slate-100 text-slate-700', Brief: 'bg-sky-100 text-sky-700', Writing: 'bg-amber-100 text-amber-800', Review: 'bg-violet-100 text-violet-700',
  Approved: 'bg-indigo-100 text-indigo-700', Placed: 'bg-cyan-100 text-cyan-800', Published: 'bg-emerald-100 text-emerald-800',
}
const ANCHOR_TYPES = [
  ['branded', 'Branded', 'bg-indigo-500'], ['url', 'Naked URL', 'bg-sky-500'], ['generic', 'Generic', 'bg-slate-400'],
  ['partial', 'Partial match', 'bg-amber-400'], ['exact', 'Exact match', 'bg-rose-500'], ['other', 'Other', 'bg-violet-400'], ['missing', 'Not set', 'bg-slate-200'],
]
const toDateInput = (s) => (s ? s.slice(0, 10) : '')
const today = () => new Date().toISOString().slice(0, 10)

function ItemModal({ item, stages, intents, niches, onClose, onChanged }) {
  const [f, setF] = useState({ ...item, secondaryText: (item.secondaryKeywords || []).join(', ') })
  const [err, setErr] = useState('')
  const [sugg, setSugg] = useState(null)
  const [openOrders, setOpenOrders] = useState([])
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  useEffect(() => {
    // Open placements for this client that don't carry an article yet.
    api.orders({ clientId: item.clientId }).then((r) => setOpenOrders(r.orders.filter((o) => !['Published', 'Live', 'Rejected'].includes(o.status) && !o.articleTitle)))
  }, [item.clientId])

  const save = async (close = true) => {
    setErr('')
    try {
      const r = await api.updateContent(item.id, {
        title: f.title, targetKeyword: f.targetKeyword, secondaryKeywords: f.secondaryText, targetUrl: f.targetUrl, anchorText: f.anchorText,
        draftUrl: f.draftUrl, brief: f.brief, writer: f.writer, niche: f.niche, intent: f.intent, wordCount: f.wordCount, status: f.status,
        dueAt: f.dueAt ? new Date(f.dueAt).toISOString() : null,
      })
      onChanged(); if (close) onClose()
      return r.item
    } catch (e) { setErr(e.message) }
  }
  const suggest = async () => { await save(false); setSugg(await api.suggestSites(item.id, { niche: f.niche })) }
  const assign = async (body) => {
    setErr('')
    try { await save(false); const r = await api.assignContent(item.id, body); setF((s) => ({ ...s, ...r.item, secondaryText: s.secondaryText })); setSugg(null); onChanged() } catch (e) { setErr(e.message) }
  }
  const unassign = async () => { const r = await api.unassignContent(item.id); setF((s) => ({ ...s, ...r.item, secondaryText: s.secondaryText })); onChanged() }
  const del = async () => { if (confirm(`Delete "${item.title}"? A linked pipeline order stays.`)) { await api.deleteContent(item.id); onChanged(); onClose() } }

  return (
    <Modal title={item.client?.name ? `${item.client.name}: article` : 'Article'} onClose={onClose} wide>
      <div className="grid grid-cols-4 gap-3">
        <div className="col-span-3"><label className="label">Title</label><input className="input" value={f.title} onChange={set('title')} /></div>
        <div><label className="label">Stage</label><select className="input" value={f.status} onChange={set('status')}>{stages.map((s) => <option key={s}>{s}</option>)}</select></div>
        <div className="col-span-2"><label className="label">Target keyword</label><input className="input" value={f.targetKeyword} onChange={set('targetKeyword')} placeholder="dha license for doctors" /></div>
        <div className="col-span-2"><label className="label">Secondary keywords</label><input className="input" value={f.secondaryText} onChange={set('secondaryText')} placeholder="comma separated" /></div>
        <div className="col-span-2"><label className="label">Client page it links to</label><input className="input" value={f.targetUrl} onChange={set('targetUrl')} placeholder="https://client.com/service" /></div>
        <div className="col-span-2"><label className="label">Anchor text</label><input className="input" value={f.anchorText} onChange={set('anchorText')} /></div>
        <div><label className="label">Intent</label><select className="input" value={f.intent} onChange={set('intent')}>{intents.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
        <div><label className="label">Niche (for site picks)</label><select className="input" value={f.niche} onChange={set('niche')}><option value="">Any</option>{niches.map((n) => <option key={n.name} value={n.name}>{n.name}</option>)}</select></div>
        <div><label className="label">Due</label><input className="input" type="date" value={toDateInput(f.dueAt)} onChange={set('dueAt')} /></div>
        <div><label className="label">Words</label><input className="input" type="number" value={f.wordCount ?? ''} onChange={set('wordCount')} /></div>
        <div className="col-span-2"><label className="label">Writer</label><input className="input" value={f.writer} onChange={set('writer')} placeholder="Who is writing it" /></div>
        <div className="col-span-2"><label className="label">Google Doc</label>
          <div className="flex gap-2"><input className="input" value={f.draftUrl} onChange={set('draftUrl')} placeholder="https://docs.google.com/…" />{f.draftUrl?.startsWith('http') && <a className="btn-ghost shrink-0" href={f.draftUrl} target="_blank" rel="noreferrer"><ExternalLink size={13} /></a>}</div>
        </div>
        <div className="col-span-4"><label className="label">Brief / angle</label><textarea className="input h-24" value={f.brief} onChange={set('brief')} placeholder="Who it's for, the angle, sections to cover, sources, what the link should support…" /></div>
      </div>

      <div className="mt-4 rounded-lg border border-slate-200 p-3">
        <div className="mb-2 text-sm font-semibold text-slate-800">Placement</div>
        {f.order ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {f.order.site && <SiteTile s={{ ...f.order.site, flags: [] }} size={28} />}
            <div className="min-w-0 flex-1"><b>{f.order.site?.name}</b> <span className="text-slate-500">{f.order.site?.url} · DR {f.order.site?.dr ?? '—'} · stage {f.order.status}</span></div>
            {f.order.publishedUrl && <LinkVerdict verdict={f.order.linkVerdict || 'pending'} />}
            <button className="btn-ghost !py-1 text-xs" onClick={unassign}><Unlink size={12} /> Unlink</button>
          </div>
        ) : (
          <div className="grid gap-2">
            <p className="text-xs text-slate-500">Linking copies the title, keywords, target page, anchor, doc and due date onto the pipeline order, and keeps them in sync when you edit here.</p>
            <div className="flex flex-wrap items-center gap-2">
              {openOrders.length > 0 && (
                <select className="input !w-auto" defaultValue="" onChange={(e) => e.target.value && assign({ orderId: e.target.value })}>
                  <option value="" disabled>Link to an open placement ({openOrders.length})…</option>
                  {openOrders.map((o) => <option key={o.id} value={o.id}>{o.site?.name} · DR {o.site?.dr ?? '—'} · {o.status}</option>)}
                </select>
              )}
              <button className="btn-ghost" onClick={suggest}><Sparkles size={13} /> Suggest publishers</button>
            </div>
            {sugg && (
              <div className="mt-1">
                <div className="mb-1 text-xs text-slate-500">{sugg.pool} fit ({f.niche || 'any niche'}, DR 30+, dofollow, 1K+ traffic). Best value first. {sugg.excludedUsed} publisher(s) already used for this client are left out, because a new referring domain is worth more than a second link from the same one.</div>
                <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {sugg.sites.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                      <SiteTile s={s} size={24} />
                      <span className="min-w-0 flex-1 truncate"><b>{s.name}</b> <span className="text-slate-500">{s.url} · {s.niches[0]}</span></span>
                      <AuthorityPill value={s.dr} label="DR" />
                      <TrafficCell value={s.traffic} />
                      <span className="w-14 text-right font-semibold tabular-nums">{fmtMoney(s.priceGuestPost)}</span>
                      <button className="btn-primary !px-2 !py-1 text-xs" onClick={() => assign({ siteId: s.id })}><Plus size={12} /> Use</button>
                    </div>
                  ))}
                  {sugg.sites.length === 0 && <div className="px-3 py-2 text-sm text-slate-500">No fits. Try a different niche.</div>}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {err && <div className="mt-3 rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
      <div className="mt-4 flex justify-between border-t border-slate-100 pt-3">
        <button className="btn-danger" onClick={del}><Trash2 size={14} /> Delete</button>
        <div className="flex gap-2"><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={() => save()}>Save</button></div>
      </div>
    </Modal>
  )
}

function Insights({ clientId }) {
  const [d, setD] = useState(null)
  useEffect(() => { if (clientId) api.contentInsights(clientId).then(setD); else setD(null) }, [clientId])
  if (!clientId) return <Empty>Pick a client above to see their anchor mix and which pages are getting links.</Empty>
  if (!d) return <div className="text-sm text-slate-500">Loading…</div>
  const withA = Math.max(1, d.withAnchor)
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card rounded-xl p-4">
        <div className="mb-1 text-sm font-semibold text-slate-800">Anchor text mix</div>
        <p className="mb-3 text-xs text-slate-500">{d.total} planned or placed links for {d.client.name}. A natural profile is led by branded and URL anchors, with exact-match keywords kept to a small share.</p>
        <div className="mb-3 flex h-3 overflow-hidden rounded-full bg-slate-100">
          {ANCHOR_TYPES.filter(([k]) => k !== 'missing').map(([k, , c]) => d.mix[k] ? <div key={k} className={c} style={{ width: `${(d.mix[k] / withA) * 100}%` }} title={`${k}: ${d.mix[k]}`} /> : null)}
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          {ANCHOR_TYPES.map(([k, l, c]) => (
            <div key={k} className="flex items-center gap-2 text-sm">
              <span className={`h-2.5 w-2.5 rounded-sm ${c}`} /><span className="flex-1 text-slate-600">{l}</span>
              <span className="tabular-nums font-semibold">{d.mix[k] || 0}</span>
              <span className="w-10 text-right text-xs tabular-nums text-slate-400">{k === 'missing' ? '' : `${Math.round(((d.mix[k] || 0) / withA) * 100)}%`}</span>
            </div>
          ))}
        </div>
        {d.warnings.length > 0 ? (
          <div className="mt-3 grid gap-1.5">{d.warnings.map((w) => <div key={w} className="flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800"><AlertTriangle size={13} className="mt-px shrink-0" /> {w}</div>)}</div>
        ) : d.withAnchor >= 4 ? <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">Anchor mix looks natural.</div> : null}
      </div>
      <div className="card rounded-xl p-4">
        <div className="mb-1 text-sm font-semibold text-slate-800">Pages getting links</div>
        <p className="mb-3 text-xs text-slate-500">Money pages with no links planned are the gap to fill next.</p>
        <table className="w-full">
          <thead><tr><th className="th">Client page</th><th className="th text-right">Live</th><th className="th text-right">Planned</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {d.targets.map((t) => (
              <tr key={t.target}>
                <td className="td max-w-[320px] !whitespace-normal"><div className="truncate text-sm text-slate-800" title={t.target}>{t.target.replace(/^https?:\/\//, '')}</div>{t.keywords.length > 0 && <div className="truncate text-xs text-slate-400">{t.keywords.join(', ')}</div>}</td>
                <td className="td text-right font-semibold tabular-nums text-emerald-700">{t.live}</td>
                <td className="td text-right tabular-nums text-slate-600">{t.planned}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function Content() {
  const [clientId, setClientId] = useState('')
  const [clients, setClients] = useState([])
  const [d, setD] = useState({ items: [], stages: [], intents: [] })
  const [niches, setNiches] = useState([])
  const [view, setView] = useState('board')
  const [open, setOpen] = useState(null)
  const [adding, setAdding] = useState(null) // 'one' | 'bulk'
  const [draft, setDraft] = useState({ title: '', targetKeyword: '', targetUrl: '', lines: '' })
  const [err, setErr] = useState('')

  const load = useCallback(() => api.content({ clientId }).then(setD), [clientId])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    api.clients().then((r) => setClients(r.clients))
    api.niches().then((r) => setNiches(r.niches))
  }, [])

  const add = async () => {
    setErr('')
    try {
      const body = adding === 'bulk' ? { clientId, lines: draft.lines } : { clientId, title: draft.title, targetKeyword: draft.targetKeyword, targetUrl: draft.targetUrl }
      await api.addContent(body)
      setAdding(null); setDraft({ title: '', targetKeyword: '', targetUrl: '', lines: '' }); load()
    } catch (e) { setErr(e.message) }
  }
  const move = async (it, status) => { await api.updateContent(it.id, { status }); load() }

  return (
    <div>
      <PageHeader title="Content planner" sub={`${d.items.length} articles${clientId ? ' for this client' : ''} · plan them, write them, place them`}>
        <select className="input w-52" value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="">All clients</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="flex rounded-md border border-slate-200 bg-white p-0.5 text-xs">
          {[['board', 'Board'], ['list', 'List'], ['insights', 'Link insights']].map(([v, l]) => <button key={v} className={`rounded px-2.5 py-1 ${view === v ? 'bg-slate-900 text-white' : 'text-slate-600'}`} onClick={() => setView(v)}>{l}</button>)}
        </div>
        <button className="btn-ghost" disabled={!clientId} title={clientId ? '' : 'Pick a client first'} onClick={() => setAdding('bulk')}><ListPlus size={14} /> Bulk add</button>
        <button className="btn-primary" disabled={!clientId} title={clientId ? '' : 'Pick a client first'} onClick={() => setAdding('one')}><Plus size={14} /> New article</button>
      </PageHeader>
      {!clientId && clients.length > 0 && view !== 'insights' && <div className="mb-3 text-xs text-slate-500">Pick a client to add articles or see their link insights.</div>}

      {view === 'insights' ? <Insights clientId={clientId} /> : d.items.length === 0 ? (
        <Empty>No articles planned yet. Pick a client and add ideas one at a time, or paste a list with <b>Bulk add</b> (one per line: <code>title | keyword | target URL</code>).</Empty>
      ) : view === 'board' ? (
        <div className="flex gap-3 overflow-x-auto overscroll-x-contain pb-3">
          {d.stages.map((st) => {
            const list = d.items.filter((x) => x.status === st)
            return (
              <div key={st} className="w-60 shrink-0 rounded-lg bg-slate-100/70 p-2">
                <div className="mb-2 flex items-center justify-between px-1"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STAGE_COLOR[st]}`}>{st}</span><span className="text-xs text-slate-500">{list.length}</span></div>
                <div className="grid gap-2">
                  {list.map((it) => {
                    const overdue = it.dueAt && it.dueAt.slice(0, 10) < today() && it.status !== 'Published'
                    return (
                      <div key={it.id} className="card px-3 py-2 hover:border-indigo-300">
                        <div role="button" tabIndex={0} className="cursor-pointer" onClick={() => setOpen(it)} onKeyDown={(e) => e.key === 'Enter' && setOpen(it)}>
                          <div className="line-clamp-2 text-sm font-medium leading-snug text-slate-900">{it.title}</div>
                          {!clientId && <div className="truncate text-[11px] text-slate-500">{it.client?.name}</div>}
                          {it.targetKeyword && <div className="mt-1 inline-block max-w-full truncate rounded bg-slate-100 px-1.5 py-px text-[11px] text-slate-600">{it.targetKeyword}</div>}
                          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                            <span className="truncate">{it.order?.site ? <><Link2 size={10} className="mr-0.5 inline" />{it.order.site.name}</> : it.writer || (it.draftUrl ? <><FileText size={10} className="mr-0.5 inline" />draft</> : '')}</span>
                            {it.dueAt && <span className={overdue ? 'font-semibold text-rose-600' : ''}><CalendarClock size={10} className="mr-0.5 inline" />{fmtDate(it.dueAt)}</span>}
                          </div>
                        </div>
                        {it.status !== 'Published' && (
                          <select className="mt-1.5 w-full rounded border border-slate-200 bg-white px-1 py-0.5 text-[11px]" value={it.status} onChange={(e) => move(it, e.target.value)}>
                            {d.stages.filter((s) => s !== 'Published').map((s) => <option key={s}>{s}</option>)}
                          </select>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="card overflow-x-auto rounded-xl">
          <table className="w-full">
            <thead><tr><th className="th">Article</th><th className="th">Client</th><th className="th">Keyword</th><th className="th">Links to</th><th className="th">Anchor</th><th className="th">Stage</th><th className="th">Publisher</th><th className="th">Due</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {d.items.map((it) => (
                <tr key={it.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setOpen(it)}>
                  <td className="td max-w-[280px] truncate font-medium text-slate-900">{it.title}</td>
                  <td className="td text-slate-600">{it.client?.name}</td>
                  <td className="td text-slate-600">{it.targetKeyword || '—'}</td>
                  <td className="td max-w-[200px] truncate text-xs text-slate-500">{it.targetUrl.replace(/^https?:\/\//, '') || '—'}</td>
                  <td className="td text-slate-600">{it.anchorText || '—'}</td>
                  <td className="td"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STAGE_COLOR[it.status]}`}>{it.status}</span></td>
                  <td className="td text-slate-600">{it.order?.site?.name || '—'}</td>
                  <td className={`td ${it.dueAt && it.dueAt.slice(0, 10) < today() && it.status !== 'Published' ? 'font-semibold text-rose-600' : 'text-slate-600'}`}>{fmtDate(it.dueAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {adding && (
        <Modal title={adding === 'bulk' ? 'Bulk add article ideas' : 'New article'} onClose={() => setAdding(null)}>
          {adding === 'bulk' ? (
            <div>
              <label className="label">One per line: title | target keyword | client page</label>
              <textarea className="input h-48 font-mono text-xs" value={draft.lines} onChange={(e) => setDraft((s) => ({ ...s, lines: e.target.value }))}
                placeholder={'How long does a DHA licence take? | dha license processing time | https://client.com/dha-license\nDHA exam pass marks explained | dha exam passing score | https://client.com/dha-exam'} />
            </div>
          ) : (
            <div className="grid gap-3">
              <div><label className="label">Title</label><input className="input" autoFocus value={draft.title} onChange={(e) => setDraft((s) => ({ ...s, title: e.target.value }))} /></div>
              <div><label className="label">Target keyword</label><input className="input" value={draft.targetKeyword} onChange={(e) => setDraft((s) => ({ ...s, targetKeyword: e.target.value }))} /></div>
              <div><label className="label">Client page it links to</label><input className="input" value={draft.targetUrl} onChange={(e) => setDraft((s) => ({ ...s, targetUrl: e.target.value }))} placeholder="https://" /></div>
            </div>
          )}
          {err && <div className="mt-2 rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
          <div className="mt-4 flex justify-end gap-2"><button className="btn-ghost" onClick={() => setAdding(null)}>Cancel</button><button className="btn-primary" onClick={add}>Add</button></div>
        </Modal>
      )}
      {open && <ItemModal item={open} stages={d.stages} intents={d.intents} niches={niches} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  )
}
