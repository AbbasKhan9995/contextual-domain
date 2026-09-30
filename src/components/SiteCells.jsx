// Visual building blocks for the Sites table. The design goal vs. the
// marketplace UIs we compared against: the numbers carry meaning at a glance
// (tiered colours instead of one flat colour for DR 20 and DR 95), rows stay
// short enough to see 12+ sites at once, and price + action never scroll away.
import { useState } from 'react'
import { AlertTriangle, HelpCircle } from 'lucide-react'
import { fmtDate } from '../lib/api.js'

export function GenreCell({ niches = [], tags = [] }) {
  const all = [...(niches || [])]
  if (!all.length && tags?.length) all.push(...tags)

  if (!all.length) return <span className="text-slate-400 dark:text-slate-600 text-xs">—</span>

  if (all.length > 2) {
    return (
      <div className="flex items-center">
        <span
          className="inline-flex items-center gap-1 text-[13px] font-medium text-slate-400 dark:text-slate-400 hover:text-slate-200 cursor-pointer transition-colors"
          title={`Genres: ${all.join(', ')}`}
        >
          {all.length} genres <HelpCircle size={13} className="text-slate-400 opacity-80" />
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-start gap-1.5 py-0.5">
      {all.map((name) => (
        <span
          key={name}
          className="inline-block rounded-md border border-slate-300 dark:border-slate-700/80 bg-slate-100 dark:bg-[#1e2638] px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-xs transition hover:border-slate-400 dark:hover:border-slate-600"
        >
          {name}
        </span>
      ))}
    </div>
  )
}

// Authority tiers used by both DR and DA pills.
const TIER = [
  [70, 'bg-emerald-600 text-white border-emerald-600'],
  [50, 'bg-emerald-50 text-emerald-800 border-emerald-200'],
  [30, 'bg-amber-50 text-amber-800 border-amber-200'],
  [0, 'bg-slate-50 text-slate-600 border-slate-200'],
]
export function AuthorityPill({ value, label }) {
  if (value === null || value === undefined) return <span className="text-slate-300">—</span>
  const cls = TIER.find(([min]) => value >= min)[1]
  return (
    <span className={`inline-flex min-w-[38px] flex-col items-center rounded-md border px-1.5 py-0.5 leading-none ${cls}`}>
      <span className="text-[13px] font-bold tabular-nums">{value}</span>
      <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider opacity-70">{label}</span>
    </span>
  )
}

export const compact = (n) => (n === null || n === undefined ? '—' : n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n))

/** Traffic with a log-scale bar: 1K ≈ empty, 100M+ = full. */
export function TrafficCell({ value }) {
  if (value === null || value === undefined) return <span className="text-slate-300">—</span>
  const pct = Math.max(4, Math.min(100, ((Math.log10(Math.max(value, 1)) - 3) / 5) * 100))
  return (
    <div className="w-[76px]" title={`${Number(value).toLocaleString()} visits / month`}>
      <div className="text-[13px] font-semibold tabular-nums text-slate-800">{compact(value)}<span className="ml-0.5 text-[10px] font-normal text-slate-400">/mo</span></div>
      <div className="mt-1 h-1 rounded-full bg-slate-100"><div className="h-full rounded-full bg-sky-500" style={{ width: `${pct}%` }} /></div>
    </div>
  )
}

export function LinkBadge({ s }) {
  if (!s.follow) return <span className="text-slate-300" title={s.linkType || 'Not stated in the sheet'}>—</span>
  const dof = s.follow === 'dofollow'
  return (
    <span title={s.linkType} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${dof ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-rose-50 text-rose-600 ring-1 ring-rose-200'}`}>
      {s.maxLinks ? `${s.maxLinks}×` : ''} {dof ? 'Dofollow' : 'Nofollow'}
    </span>
  )
}

/** Price vs the median for sites of the same DR band. */
export function ValueTag({ s }) {
  if (s.valueRatio == null) return null
  const title = `Median for DR ${Math.floor(s.dr / 10) * 10}–${Math.floor(s.dr / 10) * 10 + 9}: $${s.bandMedian}`
  if (s.valueRatio <= 0.6) return <span title={title} className="rounded bg-emerald-100 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-emerald-800">Great value</span>
  if (s.valueRatio >= 1.8) return <span title={title} className="rounded bg-slate-100 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-slate-500">{s.valueRatio.toFixed(1)}× median</span>
  return null
}

const hue = (str) => [...str].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)

/** Favicon (Google's public favicon service) with a coloured-initials
 *  fallback, plus a status dot: green live, amber flagged, red down. */
export function SiteTile({ s, size = 36 }) {
  const [failed, setFailed] = useState(false)
  const initials = s.url.replace(/\..*$/, '').slice(0, 2).toUpperCase()
  const dot = s.flags?.length ? 'bg-amber-400' : s.live === true ? 'bg-emerald-500' : s.live === false ? 'bg-rose-500' : null
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {failed ? (
        <span className="flex h-full w-full items-center justify-center rounded-lg text-[11px] font-bold text-white" style={{ background: `hsl(${hue(s.url)} 55% 45%)` }}>{initials}</span>
      ) : (
        <span className="flex h-full w-full items-center justify-center rounded-lg border border-slate-200 bg-white">
          <img src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(s.url)}&sz=64`} alt="" width={size * 0.55} height={size * 0.55} loading="lazy" draggable={false} onError={() => setFailed(true)}
            onLoad={(e) => { if (e.currentTarget.naturalWidth <= 16) setFailed(true) }} />
        </span>
      )}
      {dot && <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${dot}`} />}
    </span>
  )
}

/** Live / down / unverified / flagged — flags win, since a "live" hosting
 *  domain is still not a real publication. */
export function Status({ s }) {
  if (s.listing === 'pending') {
    return (
      <span className="inline-flex max-w-[220px] items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200" title={`Pending: hidden from clients.\n${s.pendingReason || ''}${s.flags?.length ? '\n' + s.flags.join('\n') : ''}`}>
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" /><span className="truncate">Pending · {s.pendingReason?.replace(/^Unverified: /, 'unverified: ') || ''}</span>
      </span>
    )
  }
  if (s.listing === 'active') {
    return <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700" title={s.approved ? 'Approved by you: shown to clients' : `Live, shown to clients · checked ${fmtDate(s.checkedAt)}`}><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {s.approved ? 'Approved' : 'Live'}</span>
  }
  if (s.flags?.length) return <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200" title={s.flags.join('\n')}><AlertTriangle size={11} /> Flagged</span>
  if (s.live === true) return <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700" title={`HTTP ${s.httpStatus} · checked ${fmtDate(s.checkedAt)}`}><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Live</span>
  if (s.live === false) return <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600" title={s.checkNote || `HTTP ${s.httpStatus}`}><span className="h-1.5 w-1.5 rounded-full bg-rose-500" /> Down</span>
  if (s.checkedAt) return <span className="text-[11px] text-slate-500" title={s.checkNote || 'Could not verify'}>Unverified</span>
  return <span className="text-[11px] text-slate-300" title="Not checked yet: run Data health → Check">—</span>
}

/** Live summary of whatever the filters currently match. */
export function SummaryStrip({ sites }) {
  const priced = sites.map((s) => s.priceGuestPost).filter((p) => p > 0).sort((a, b) => a - b)
  const drs = sites.map((s) => s.dr).filter((v) => v != null)
  const withFollow = sites.filter((s) => s.follow)
  const checked = sites.filter((s) => s.checkedAt)
  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—')
  const items = [
    ['Sites', sites.length.toLocaleString(), ''],
    ['Median price', priced.length ? `$${priced[Math.floor(priced.length / 2)].toLocaleString()}` : '—', priced.length ? `$${priced[0]} – $${priced[priced.length - 1].toLocaleString()}` : ''],
    ['Avg DR', drs.length ? Math.round(drs.reduce((a, b) => a + b, 0) / drs.length) : '—', `${drs.length} with DR`],
    ['Dofollow', pct(withFollow.filter((s) => s.follow === 'dofollow').length, withFollow.length), `of ${withFollow.length} stated`],
    ['Great value', sites.filter((s) => s.valueRatio != null && s.valueRatio <= 0.6).length.toLocaleString(), '≤ 60% of band median'],
    ['Live', pct(checked.filter((s) => s.live === true).length, checked.length), `of ${checked.length} checked`],
  ]
  return (
    <div className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-3 lg:grid-cols-6">
      {items.map(([label, value, sub]) => (
        <div key={label} className="bg-white px-4 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
          <div className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{value}</div>
          <div className="truncate text-[11px] text-slate-400">{sub}</div>
        </div>
      ))}
    </div>
  )
}
