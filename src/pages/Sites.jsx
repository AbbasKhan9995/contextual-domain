import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Upload, Plus, ArrowUpDown, ExternalLink, Pencil, Trash2, KanbanSquare, ChevronLeft, ChevronRight, Activity, Columns3, SlidersHorizontal, X, Rows3, Rows4, Sparkles, Search } from 'lucide-react'
import { api, fmtNum, fmtPrice, fmtDate } from '../lib/api.js'
import DataHealth from '../components/DataHealth.jsx'
import { PageHeader, NicheChip, Empty } from '../components/ui.jsx'
import { AuthorityPill, TrafficCell, LinkBadge, ValueTag, SiteTile, Status, SummaryStrip } from '../components/SiteCells.jsx'
import ImportModal from '../components/ImportModal.jsx'
import AddToPipeline from '../components/AddToPipeline.jsx'
import SiteForm from '../components/SiteForm.jsx'

const PAGE_SIZE = 20

// Every column after the pinned Site column. `sort` is the API sort key; the
// user can hide any of these from the Columns menu.
const COLUMNS = [
  { key: 'dr', label: 'DR', sort: 'dr', cell: (s) => <AuthorityPill value={s.dr} label="DR" /> },
  { key: 'da', label: 'DA', sort: 'da', cell: (s) => <AuthorityPill value={s.da} label="DA" /> },
  { key: 'traffic', label: 'Traffic', sort: 'traffic', cell: (s) => <TrafficCell value={s.traffic} /> },
  { key: 'follow', label: 'Link', sort: 'follow', cell: (s) => <LinkBadge s={s} /> },
  { key: 'tat', label: 'TAT', sort: 'tatDays', cell: (s) => s.tatDays == null ? <span className="text-slate-300" title={s.tat || ''}>—</span> : (
    <span title={s.tat} className={`inline-flex rounded-md px-1.5 py-0.5 text-[12px] font-semibold tabular-nums ${s.tatDays <= 3 ? 'bg-sky-50 text-sky-700' : 'bg-slate-50 text-slate-600'}`}>{s.tatDays < 1 ? '<1d' : `${s.tatDays}d`}</span>
  ) },
  { key: 'priceLinkInsert', label: 'Link insert', sort: 'priceLinkInsert', cls: 'tabular-nums text-slate-600', cell: (s) => <span className={s.priceLinkInsert === 0 ? 'text-slate-400' : ''}>{fmtPrice(s.priceLinkInsert)}</span> },
  { key: 'maxLinks', label: 'Max links', sort: 'maxLinks', cls: 'tabular-nums text-slate-600', cell: (s) => s.maxLinks ?? '—' },
  { key: 'sponsored', label: 'Sponsored', sort: 'sponsored', cell: (s) => s.sponsored ? <span className="text-xs text-amber-700">Tagged</span> : <span className="text-slate-300">—</span> },
  { key: 'country', label: 'Country', sort: 'country', cls: 'text-slate-600', cell: (s) => s.country ? <span title={`From ${s.countrySource}`}>{s.country}</span> : <span className="text-slate-300">—</span> },
  { key: 'language', label: 'Language', sort: 'language', cls: 'text-slate-600', cell: (s) => s.language || <span className="text-slate-300">—</span> },
  { key: 'indexed', label: 'Indexed', sort: 'indexed', cell: (s) => s.indexed === null || s.indexed === undefined ? '—' : s.indexed ? <span className="text-emerald-700">Yes</span> : <span className="text-rose-600">No</span> },
  { key: 'status', label: 'Status', sort: 'live', cell: (s) => <Status s={s} /> },
  { key: 'niches', label: 'Niches', cell: (s) => (
    // One line, never wrapped: uneven row heights read as jitter.
    <div className="flex flex-nowrap gap-1">
      {s.niches.map((n) => <NicheChip key={n} name={n} />)}
      {(s.tags || []).slice(0, 3).map((t) => <span key={t} className="inline-block rounded border border-slate-200 px-1.5 py-0.5 text-[11px] text-slate-500">{t}</span>)}
      {(s.tags || []).length > 3 && <span className="text-[11px] text-slate-400">+{s.tags.length - 3}</span>}
    </div>
  ) },
]
const DEFAULT_HIDDEN = ['maxLinks', 'sponsored', 'language', 'indexed']

// One-click chips over the most common questions. Each is a patch onto the
// filter state; a chip is "on" when every key in its patch matches.
const QUICK = [
  { label: 'Great value', icon: true, patch: { value: 'great' } },
  { label: 'Dofollow', patch: { follow: 'dofollow' } },
  { label: 'DR 50+', patch: { minDr: 50, maxDr: '' } },
  { label: 'Traffic 100K+', patch: { minTraffic: '100K', maxTraffic: '' } },
  { label: 'Under $100', patch: { minPrice: '', maxPrice: 100 } },
  { label: '≤ 3 days', patch: { minTat: '', maxTat: 3 } },
  { label: 'Live only', patch: { live: 'yes' } },
  { label: 'Hide flagged', patch: { flagged: 'hide' } },
]
const DENSITY_KEY = 'gpp.sites.density'
const COLS_KEY = 'gpp.sites.hiddenCols'
const loadHidden = () => { try { const v = JSON.parse(localStorage.getItem(COLS_KEY)); return Array.isArray(v) ? v : DEFAULT_HIDDEN } catch { return DEFAULT_HIDDEN } }

// Min/max range filters with one-click presets (click an active preset again to clear it).
const RANGES = [
  { label: 'DR', min: 'minDr', max: 'maxDr', presets: [['0–20', '', 20], ['20–40', 20, 40], ['40–60', 40, 60], ['60–80', 60, 80], ['80+', 80, '']] },
  { label: 'DA', min: 'minDa', max: 'maxDa', presets: [['0–20', '', 20], ['20–40', 20, 40], ['40–60', 40, 60], ['60–80', 60, 80], ['80+', 80, '']] },
  { label: 'Traffic / mo', min: 'minTraffic', max: 'maxTraffic', text: true, presets: [['10K+', '10K', ''], ['100K+', '100K', ''], ['500K+', '500K', ''], ['1M+', '1M', '']] },
  { label: 'Price $', min: 'minPrice', max: 'maxPrice', presets: [['≤100', '', 100], ['100–300', 100, 300], ['300–600', 300, 600], ['600+', 600, '']] },
  { label: 'TAT days', min: 'minTat', max: 'maxTat', presets: [['≤2', '', 2], ['≤3', '', 3], ['≤7', '', 7], ['≤14', '', 14]] },
]

const SORTS = [
  ['dr:desc', 'DR: high to low'], ['da:desc', 'DA: high to low'], ['traffic:desc', 'Traffic: highest first'],
  ['priceGuestPost:asc', 'Price: low to high'], ['priceGuestPost:desc', 'Price: high to low'], ['valueRatio:asc', 'Best value first'],
  ['tatDays:asc', 'Turnaround: fastest first'], ['name:asc', 'Name: A to Z'],
]

const BLANK = {
  listing: '',
  q: '', niche: '', value: '', country: '', language: '', follow: '', sponsored: '', live: '', flagged: '', indexed: '', linkInsert: '',
  minDa: '', maxDa: '', minDr: '', maxDr: '', minTraffic: '', maxTraffic: '', minPrice: '', maxPrice: '', minTat: '', maxTat: '',
  sort: 'dr', dir: 'desc',
}

/** Prev / windowed page numbers / Next, plus a jump box when there are many pages. */
function Pager({ current, count, onChange }) {
  if (count <= 1) return null
  const pages = new Set([1, count, current - 1, current, current + 1].filter((p) => p >= 1 && p <= count))
  const list = [...pages].sort((a, b) => a - b)
  const go = (p) => onChange(Math.min(count, Math.max(1, p)))
  return (
    <div className="flex items-center gap-1 text-sm">
      <button className="btn-ghost !px-2" disabled={current === 1} onClick={() => go(current - 1)} title="Previous page"><ChevronLeft size={14} /></button>
      {list.map((p, i) => (
        <span key={p} className="flex items-center gap-1">
          {i > 0 && list[i - 1] !== p - 1 && <span className="px-1 text-slate-400">…</span>}
          <button className={`rounded-md px-2.5 py-1 tabular-nums ${p === current ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`} onClick={() => go(p)}>{p}</button>
        </span>
      ))}
      <button className="btn-ghost !px-2" disabled={current === count} onClick={() => go(current + 1)} title="Next page"><ChevronRight size={14} /></button>
      {count > 5 && (
        <label className="ml-2 flex items-center gap-1 text-xs text-slate-500">Go to
          <input type="number" min={1} max={count} className="input !w-16 !py-1" placeholder={String(current)}
            onKeyDown={(e) => { if (e.key === 'Enter') { go(Number(e.currentTarget.value)); e.currentTarget.value = '' } }} />
        </label>
      )}
    </div>
  )
}

export default function Sites() {
  const [params, setParams] = useSearchParams()
  const [f, setF] = useState({ ...BLANK, niche: params.get('niche') || '' })
  const [data, setData] = useState({ sites: [], total: 0 })
  const [niches, setNiches] = useState([])
  const [facets, setFacets] = useState({ countries: [], languages: [], flagged: 0, active: 0, pending: 0 })
  const [modal, setModal] = useState(null) // {type:'import'|'add'|'edit'|'pipeline'|'health', site}
  const [showRanges, setShowRanges] = useState(false)
  const [hidden, setHidden] = useState(loadHidden)
  const [colMenu, setColMenu] = useState(false)
  const cols = COLUMNS.filter((c) => !hidden.includes(c.key))
  const toggleCol = (key) => setHidden((h) => {
    const next = h.includes(key) ? h.filter((k) => k !== key) : [...h, key]
    try { localStorage.setItem(COLS_KEY, JSON.stringify(next)) } catch { /* storage blocked */ }
    return next
  })
  const activeCount = Object.keys(BLANK).filter((k) => !['sort', 'dir'].includes(k) && f[k] !== BLANK[k]).length
  const clearAll = () => { setF((s) => ({ ...BLANK, sort: s.sort, dir: s.dir })); setParams({}) }
  const quickOn = (p) => Object.entries(p).every(([k, v]) => String(f[k]) === String(v))
  const toggleQuick = (p) => setF((s) => (quickOn(p) ? { ...s, ...Object.fromEntries(Object.keys(p).map((k) => [k, ''])) } : { ...s, ...p }))
  const [density, setDensity] = useState(() => { try { return localStorage.getItem(DENSITY_KEY) || 'comfortable' } catch { return 'comfortable' } })
  const flipDensity = () => setDensity((d) => { const n = d === 'compact' ? 'comfortable' : 'compact'; try { localStorage.setItem(DENSITY_KEY, n) } catch { /* storage blocked */ } return n })
  const dense = density === 'compact'
  const setRange = (r, a, b) => setF((s) => (String(s[r.min]) === String(a) && String(s[r.max]) === String(b) ? { ...s, [r.min]: '', [r.max]: '' } : { ...s, [r.min]: a, [r.max]: b }))

  // 20 sites per page; any filter change goes back to page 1.
  const [page, setPage] = useState(1)
  useEffect(() => { setPage(1) }, [f])
  const pageCount = Math.max(1, Math.ceil(data.sites.length / PAGE_SIZE))
  const current = Math.min(page, pageCount)
  const rows = data.sites.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)

  // Custom horizontal scrollbar above the table. A native bar was tried and
  // rejected: on Windows, Chrome snaps a native thumb back to where the drag
  // began if the pointer drifts more than a few bar-heights off the bar — and
  // with a thin bar above a tall table the pointer always drifts. This thumb
  // uses pointer capture, so the drag follows the mouse anywhere on screen.
  // The table box hides its own bars and is scrolled only from here. Nothing
  // sets React state during a drag: every update writes straight to the DOM,
  // so nothing re-renders (and closes open dropdowns) while scrolling.
  const boxRef = useRef(null), railRef = useRef(null), trackRef = useRef(null), thumbRef = useRef(null)
  const geom = () => {
    const box = boxRef.current, track = trackRef.current
    if (!box || !track) return null
    const max = box.scrollWidth - box.clientWidth
    const trackW = track.clientWidth
    const thumbW = max > 0 ? Math.max(56, Math.round((trackW * box.clientWidth) / box.scrollWidth)) : trackW
    return { box, max, trackW, thumbW, travel: trackW - thumbW }
  }
  const paint = () => {
    const g = geom(), thumb = thumbRef.current, rail = railRef.current
    if (!g || !thumb || !rail) return
    rail.hidden = g.max <= 1
    thumb.style.width = `${g.thumbW}px`
    thumb.style.transform = `translateX(${g.max > 0 ? (g.box.scrollLeft / g.max) * g.travel : 0}px)`
  }
  const scrollTo = (x) => {
    const g = geom()
    if (!g) return
    g.box.scrollLeft = Math.max(0, Math.min(g.max, x))
    paint()
  }
  useLayoutEffect(() => {
    paint()
    window.addEventListener('resize', paint)
    return () => window.removeEventListener('resize', paint)
  }, [data, current])

  const drag = useRef(null)
  const onThumbDown = (e) => {
    const g = geom()
    if (!g) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, from: g.box.scrollLeft, ratio: g.travel > 0 ? g.max / g.travel : 0 }
  }
  const onThumbMove = (e) => { const d = drag.current; if (d) scrollTo(d.from + (e.clientX - d.x) * d.ratio) }
  const onThumbUp = (e) => { drag.current = null; try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* already released */ } }
  // Click on the empty track: jump so the thumb centres on the click.
  const onTrackDown = (e) => {
    if (e.target !== e.currentTarget) return
    const g = geom()
    if (!g) return
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left - g.thumbW / 2
    scrollTo(g.travel > 0 ? (x / g.travel) * g.max : 0)
  }
  const step = (dir) => { const g = geom(); if (g) scrollTo(g.box.scrollLeft + dir * Math.max(160, g.box.clientWidth * 0.5)) }

  // The rows themselves scroll sideways too — three ways:
  // 1. Wheel: trackpad horizontal swipe (deltaX) or Shift + mouse wheel
  //    (Chrome delivers that as deltaY with shiftKey in some builds).
  const onWheel = (e) => {
    const box = boxRef.current
    if (!box) return
    let dx = e.deltaX
    if (!dx && e.shiftKey) dx = e.deltaY
    if (e.deltaMode === 1) dx *= 16 // line mode → pixels
    if (dx) scrollTo(box.scrollLeft + dx)
  }
  // 2. Grab and drag the rows. Dragging RIGHT moves you to the right side of
  //    the table — the same direction the thumb moves — not map-style (where
  //    content follows the hand): Khalid reads a rightward swipe as "go right",
  //    and map-style kept snapping him back to the left edge. The drag captures
  //    the pointer so it keeps following the mouse, and a real drag (>6px)
  //    suppresses the row's click so letting go doesn't open the site.
  const pan = useRef(null), suppressClick = useRef(false)
  const onBoxPointerDown = (e) => {
    if (e.button !== 0 || !boxRef.current || e.target.closest('button, a, input, select')) return
    pan.current = { x: e.clientX, from: boxRef.current.scrollLeft, moved: false, id: e.pointerId }
  }
  // Take keyboard focus WITHOUT the browser's scroll-into-view: the box is
  // taller than the viewport, so default focus would yank the page down on
  // every click (and the click would then land on a different row).
  const onBoxMouseDown = (e) => {
    if (!boxRef.current || e.target.closest('button, a, input, select')) return
    e.preventDefault()
    boxRef.current.focus({ preventScroll: true })
  }
  const onBoxPointerMove = (e) => {
    const p = pan.current, box = boxRef.current
    if (!p || !box) return
    const dx = e.clientX - p.x
    if (!p.moved) {
      if (Math.abs(dx) < 6) return
      p.moved = true
      box.classList.add('panning')
      try { box.setPointerCapture(p.id) } catch { /* not capturable */ }
    }
    scrollTo(p.from + dx)
  }
  const onBoxPointerUp = () => {
    const p = pan.current, box = boxRef.current
    if (!p || !box) return
    box.classList.remove('panning')
    try { box.releasePointerCapture(p.id) } catch { /* already released */ }
    if (p.moved) suppressClick.current = true
    pan.current = null
  }
  const onBoxClickCapture = (e) => {
    if (!suppressClick.current) return
    suppressClick.current = false
    e.stopPropagation()
    e.preventDefault()
  }
  // 3. Keyboard: focus the table (click a row area or Tab to it) and use ← →.
  const onBoxKeyDown = (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1) }
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1) }
  }

  const load = useCallback(() => {
    api.sites(f).then(setData)
    api.niches().then((r) => setNiches(r.niches))
  }, [f])
  const loadFacets = () => api.facets().then(setFacets)
  useEffect(() => { loadFacets() }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => { const n = params.get('niche') || ''; if (n !== f.niche) setF((s) => ({ ...s, niche: n })) }, [params]) // eslint-disable-line

  const set = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? (e.target.checked ? 'yes' : '') : e.target.value
    setF((s) => ({ ...s, [k]: v }))
    if (k === 'niche') setParams(v ? { niche: v } : {})
  }
  // First click on a column: text columns go A→Z, numbers go high→low.
  const sortBy = (k) => setF((s) => ({ ...s, sort: k, dir: s.sort === k ? (s.dir === 'desc' ? 'asc' : 'desc') : ['name', 'country', 'language', 'follow', 'tatDays'].includes(k) ? 'asc' : 'desc' }))
  // Shown to clients vs pending: one site, or everything in the current view.
  const setListing = async (s, override) => { await api.updateSite(s.id, { listingOverride: override }); load(); loadFacets() }
  const approveAllShown = async () => {
    const ids = data.sites.filter((s) => s.listing === 'pending' && s.live !== false && !s.platform).map((s) => s.id)
    if (!ids.length) return
    if (!confirm(`Show ${ids.length} pending sites to clients? Down sites and hosting platforms in this view are skipped.`)) return
    await api.setListing(ids, 'approve'); load(); loadFacets()
  }
  const del = async (s) => { if (confirm(`Remove ${s.name} from the list? Pipeline entries for it will be deleted too.`)) { await api.deleteSite(s.id); load() } }

  // A row is a link to the site, not text to copy: clicking anywhere on it
  // opens the site; the action buttons and inner links stop the click.
  const openSite = (s) => window.open(`https://${s.url}`, '_blank', 'noopener,noreferrer')
  const stop = (e) => e.stopPropagation()

  const first = data.sites.length ? (current - 1) * PAGE_SIZE + 1 : 0
  const last = Math.min(current * PAGE_SIZE, data.sites.length)

  return (
    <div>
      <PageHeader title="Sites" sub={`${data.total.toLocaleString()} publishers in inventory · ${facets.flagged} flagged`}>
        <button className="btn-ghost" onClick={() => setModal({ type: 'health' })}><Activity size={14} /> Data health</button>
        <button className="btn-ghost" onClick={() => setModal({ type: 'add' })}><Plus size={14} /> Add site</button>
        <button className="btn-primary" onClick={() => setModal({ type: 'import' })}><Upload size={14} /> Import</button>
      </PageHeader>

      {/* flex-wrap, not a rigid grid: a rigid grid overflowed the main area so
          the page body scrolled sideways and fought the table. */}
      <div className="card mb-4 overflow-hidden rounded-xl">
        <div className="flex flex-wrap items-center gap-2 px-4 pt-4">
          <div className="relative min-w-[220px] flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input !rounded-lg !py-2.5 !pl-9 !text-[15px]" placeholder="Search by domain, name, niche or tag…" value={f.q} onChange={set('q')} />
          </div>
          <select className="input !w-auto !rounded-lg !py-2.5" value={f.niche} onChange={set('niche')}>
            <option value="">All niches</option>
            {niches.map((n) => <option key={n.name} value={n.name}>{n.name} ({n.count})</option>)}
          </select>
          <button className={`btn-ghost !rounded-lg !py-2.5 ${showRanges ? '!border-indigo-300 !bg-indigo-50 !text-indigo-700' : ''}`} onClick={() => setShowRanges((v) => !v)}>
            <SlidersHorizontal size={14} /> More filters
          </button>
          {activeCount > 0 && <button className="btn-ghost !rounded-lg !py-2.5" onClick={clearAll}><X size={14} /> Clear {activeCount}</button>}
        </div>

        <div className="flex flex-wrap gap-1.5 px-4 py-3">
          {QUICK.map((q) => {
            const on = quickOn(q.patch)
            return (
              <button key={q.label} onClick={() => toggleQuick(q.patch)}
                className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors ${on ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'}`}>
                {q.icon && <Sparkles size={12} className={on ? 'text-emerald-300' : 'text-emerald-500'} />}{q.label}
              </button>
            )
          })}
        </div>

        {showRanges && (
          <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {RANGES.map((r) => (
                <div key={r.label} className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{r.label}</div>
                  <div className="flex items-center gap-1">
                    <input className="input !py-1" type={r.text ? 'text' : 'number'} placeholder="min" value={f[r.min]} onChange={set(r.min)} />
                    <span className="text-slate-300">–</span>
                    <input className="input !py-1" type={r.text ? 'text' : 'number'} placeholder="max" value={f[r.max]} onChange={set(r.max)} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {r.presets.map(([l, a, b]) => {
                      const on = String(f[r.min]) === String(a) && String(f[r.max]) === String(b)
                      return <button key={l} onClick={() => setRange(r, a, b)} className={`rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${on ? 'border-indigo-500 bg-indigo-600 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{l}</button>
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              {[
                ['Country', 'country', [['', 'Any country'], ...facets.countries.map((c) => [c.name, `${c.name} (${c.count})`]), ['__none', 'Unknown']]],
                ['Language', 'language', [['', 'Any'], ...facets.languages.map((c) => [c.name, `${c.name} (${c.count})`]), ['__none', 'Unknown']]],
                ['Link type', 'follow', [['', 'Any'], ['dofollow', 'Dofollow'], ['nofollow', 'Nofollow']]],
                ['Sponsored', 'sponsored', [['', 'Any'], ['no', 'Not tagged'], ['yes', 'Tagged']]],
                ['Status', 'live', [['', 'Any'], ['yes', 'Live'], ['no', 'Down / parked'], ['unchecked', 'Not checked']]],
                ['Flagged', 'flagged', [['', 'Show all'], ['hide', 'Hide flagged'], ['only', `Only flagged (${facets.flagged})`]]],
                ['Indexed', 'indexed', [['', 'Any'], ['yes', 'Yes'], ['no', 'No']]],
              ].map(([label, key, opts]) => (
                <div key={key} className="min-w-[120px]"><label className="label">{label}</label>
                  <select className="input" value={f[key]} onChange={set(key)}>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                </div>
              ))}
              <label className="flex items-center gap-1.5 pb-2 text-sm text-slate-600"><input type="checkbox" checked={f.linkInsert === 'yes'} onChange={set('linkInsert')} /> Offers link insert</label>
            </div>
          </div>
        )}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
          {[['', 'All sites', facets.active + facets.pending], ['active', 'Shown to clients', facets.active], ['pending', 'Pending', facets.pending]].map(([v, l, n]) => (
            <button key={v || 'all'} onClick={() => setF((s) => ({ ...s, listing: v }))} className={`rounded-md px-3 py-1.5 ${f.listing === v ? (v === 'pending' ? 'bg-amber-500 text-white' : 'bg-slate-900 text-white') : 'text-slate-600 hover:bg-slate-50'}`}>
              {l} <span className="ml-1 tabular-nums opacity-70">{n.toLocaleString()}</span>
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-500">Clients only ever see sites that checked live and aren't flagged. The rest wait in Pending and come back on their own when a check finds them live.</span>
        {f.listing === 'pending' && data.sites.length > 0 && <button className="btn-ghost ml-auto !py-1 text-xs" onClick={approveAllShown}>Approve all {data.sites.filter((s) => s.live !== false && !s.platform).length} in this view</button>}
      </div>

      <SummaryStrip sites={data.sites} />

      {data.sites.length === 0 ? <Empty>No sites match. Import the sheet or loosen the filters.</Empty> : (
        <div className="card overflow-hidden rounded-xl">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2.5">
            <span className="mr-auto text-sm text-slate-500">Showing <b className="text-slate-800">{first}–{last}</b> of <b className="text-slate-800">{data.sites.length.toLocaleString()}</b></span>
            <select className="input !w-auto !py-1 text-xs" value={`${f.sort}:${f.dir}`} onChange={(e) => { const [sort, dir] = e.target.value.split(':'); setF((s) => ({ ...s, sort, dir })) }}>
              {!SORTS.some(([v]) => v === `${f.sort}:${f.dir}`) && <option value={`${f.sort}:${f.dir}`}>Sort: column header</option>}
              {SORTS.map(([v, l]) => <option key={v} value={v}>Sort: {l}</option>)}
            </select>
            <div className="relative">
              <button className="btn-ghost !py-1 text-xs" onClick={() => setColMenu((v) => !v)}><Columns3 size={13} /> Columns <span className="rounded bg-slate-100 px-1 tabular-nums">{cols.length + 2}</span></button>
              {colMenu && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setColMenu(false)} />
                  <div className="absolute right-0 top-full z-40 mt-1 w-52 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
                    <div className="px-1 pb-1 text-[11px] uppercase tracking-wide text-slate-400">Site and Price always show</div>
                    {COLUMNS.map((c) => (
                      <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm text-slate-700 hover:bg-slate-50">
                        <input type="checkbox" checked={!hidden.includes(c.key)} onChange={() => toggleCol(c.key)} /> {c.label}
                      </label>
                    ))}
                    <button className="mt-1 w-full rounded px-1 py-1 text-left text-xs text-indigo-600 hover:bg-slate-50" onClick={() => { setHidden(DEFAULT_HIDDEN); try { localStorage.removeItem(COLS_KEY) } catch { /* storage blocked */ } }}>Reset to default</button>
                  </div>
                </>
              )}
            </div>
            <button className="btn-ghost !py-1 text-xs" onClick={flipDensity} title="Row density">{dense ? <Rows4 size={13} /> : <Rows3 size={13} />} {dense ? 'Compact' : 'Comfortable'}</button>
            <Pager current={current} count={pageCount} onChange={setPage} />
          </div>
          {/* The only horizontal scrollbar: above the table, always in view. */}
          <div ref={railRef} className="hscroll">
            <button type="button" className="hscroll-btn" onClick={() => step(-1)} aria-label="Scroll left"><ChevronLeft size={15} /></button>
            <div ref={trackRef} className="hscroll-track" role="scrollbar" aria-orientation="horizontal" aria-label="Scroll the table sideways" tabIndex={0}
              onPointerDown={onTrackDown} onKeyDown={(e) => { if (e.key === 'ArrowLeft') step(-1); if (e.key === 'ArrowRight') step(1) }}>
              <div ref={thumbRef} className="hscroll-thumb" onPointerDown={onThumbDown} onPointerMove={onThumbMove} onPointerUp={onThumbUp} onPointerCancel={onThumbUp} />
            </div>
            <button type="button" className="hscroll-btn" onClick={() => step(1)} aria-label="Scroll right"><ChevronRight size={15} /></button>
          </div>
          <div ref={boxRef} className="scroll-box" tabIndex={0} onWheel={onWheel} onCopy={(e) => e.preventDefault()}
            onMouseDown={onBoxMouseDown}
            onPointerDown={onBoxPointerDown} onPointerMove={onBoxPointerMove} onPointerUp={onBoxPointerUp} onPointerCancel={onBoxPointerUp}
            onClickCapture={onBoxClickCapture} onKeyDown={onBoxKeyDown}>
            <table className="w-full select-none">
              <thead><tr>
                {/* Site pins left and Price pins right, so name, price and the
                    add button stay in view however far the table scrolls. */}
                <th className="th sticky left-0 z-20 cursor-pointer shadow-[inset_-1px_0_0_#e2e8f0] hover:text-slate-800" onClick={() => sortBy('name')}>
                  <span className="inline-flex items-center gap-1">Publisher{f.sort === 'name' && <ArrowUpDown size={11} className="text-indigo-500" />}</span>
                </th>
                {cols.map((c) => (
                  <th key={c.key} className={`th ${c.sort ? 'cursor-pointer hover:text-slate-800' : ''}`} onClick={c.sort ? () => sortBy(c.sort) : undefined}>
                    <span className="inline-flex items-center gap-1">{c.label}{c.sort && f.sort === c.sort && <ArrowUpDown size={11} className="text-indigo-500" />}</span>
                  </th>
                ))}
                <th className="th sticky right-0 z-20 cursor-pointer text-right shadow-[inset_1px_0_0_#e2e8f0] hover:text-slate-800" onClick={() => sortBy('priceGuestPost')}>
                  <span className="inline-flex items-center gap-1">Guest post{f.sort === 'priceGuestPost' && <ArrowUpDown size={11} className="text-indigo-500" />}</span>
                </th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((s) => (
                  <tr key={s.id} className="group cursor-pointer hover:bg-indigo-50/40" onClick={() => openSite(s)} title={`Open ${s.url}`}>
                    <td className={`td sticky left-0 z-[1] bg-white shadow-[inset_-1px_0_0_#e2e8f0] group-hover:bg-[#f7f8fe] ${dense ? '!py-1.5' : '!py-2.5'}`}>
                      <div className="flex items-center gap-3">
                        <SiteTile s={s} size={dense ? 26 : 36} />
                        <div className="min-w-0 max-w-[260px]">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate font-semibold text-slate-900">{s.name}</span>
                            <ValueTag s={s} />
                            {s.orderCount > 0 && <span className="rounded bg-indigo-100 px-1.5 py-px text-[10px] font-semibold text-indigo-700">{s.orderCount} in pipeline</span>}
                          </div>
                          {!dense && (
                            <div className="flex items-center gap-1 text-xs text-slate-500">
                              <a href={`https://${s.url}`} target="_blank" rel="noreferrer" className="truncate hover:text-indigo-600" onClick={stop}>{s.url}</a>
                              {s.note && <span className="truncate text-slate-400">· {s.note}</span>}
                              {s.sampleLink && s.sampleLink.startsWith('http') && <a href={s.sampleLink} target="_blank" rel="noreferrer" title="Sample placement" className="inline-flex items-center gap-0.5 text-indigo-500 hover:text-indigo-700" onClick={stop}><ExternalLink size={11} /> sample</a>}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    {cols.map((c) => <td key={c.key} className={`td ${dense ? '!py-1.5' : '!py-2.5'} ${c.cls || ''}`}>{c.cell(s)}</td>)}
                    <td className={`td sticky right-0 z-[1] bg-white shadow-[inset_1px_0_0_#e2e8f0] group-hover:bg-[#f7f8fe] ${dense ? '!py-1.5' : '!py-2.5'}`} onClick={stop}>
                      <div className="flex items-center justify-end gap-2">
                        <span className={`min-w-[56px] text-right text-[15px] font-bold tabular-nums ${s.priceGuestPost === 0 ? 'text-slate-400' : 'text-slate-900'}`}>{fmtPrice(s.priceGuestPost)}</span>
                        <button className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-600" title="Add to pipeline" onClick={() => setModal({ type: 'pipeline', site: s })}><KanbanSquare size={13} /> Add</button>
                        {s.listing === 'pending' && s.pendingReason !== 'Held by you'
                          ? <button className="rounded-md px-1.5 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50" title="Show this site to clients anyway (e.g. a firewall blocked the check)" onClick={() => setListing(s, 'approve')}>Approve</button>
                          : s.listing === 'pending'
                            ? <button className="rounded-md px-1.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100" title="Stop holding: follow the automatic checks again" onClick={() => setListing(s, null)}>Release</button>
                            : <button className="rounded-md px-1.5 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-50" title="Hide this site from clients" onClick={() => setListing(s, 'hold')}>Hold</button>}
                        <button className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Edit" onClick={() => setModal({ type: 'edit', site: s })}><Pencil size={13} /></button>
                        <button className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Delete" onClick={() => del(s)}><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-2.5">
            <span className="text-sm text-slate-500">Showing {first}–{last} of {data.sites.length.toLocaleString()}</span>
            <Pager current={current} count={pageCount} onChange={setPage} />
          </div>
        </div>
      )}

      {modal?.type === 'health' && <DataHealth onClose={() => setModal(null)} onChanged={() => { load(); loadFacets() }} />}
      {modal?.type === 'import' && <ImportModal niches={niches} onClose={() => setModal(null)} onDone={load} />}
      {modal?.type === 'pipeline' && <AddToPipeline site={modal.site} onClose={() => setModal(null)} onDone={load} />}
      {(modal?.type === 'add' || modal?.type === 'edit') && <SiteForm site={modal.site} onClose={() => setModal(null)} onDone={load} />}
    </div>
  )
}
