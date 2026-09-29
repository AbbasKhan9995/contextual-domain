import { CheckCircle2, AlertTriangle, XCircle, HelpCircle, Clock, Link2Off } from 'lucide-react'
import { fmtDate } from '../lib/api.js'

export const VERDICT = {
  ok: { label: 'Live & followed', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', icon: CheckCircle2, client: 'Verified live' },
  changed: { label: 'Changed', cls: 'bg-amber-50 text-amber-700 ring-amber-200', icon: AlertTriangle, client: 'Live, under review' },
  lost: { label: 'Link lost', cls: 'bg-rose-50 text-rose-700 ring-rose-200', icon: Link2Off, client: 'Being replaced' },
  page_down: { label: 'Page down', cls: 'bg-rose-50 text-rose-700 ring-rose-200', icon: XCircle, client: 'Being replaced' },
  unverified: { label: 'Unverified', cls: 'bg-slate-50 text-slate-600 ring-slate-200', icon: HelpCircle, client: 'Check pending' },
  pending: { label: 'Not checked yet', cls: 'bg-slate-50 text-slate-500 ring-slate-200', icon: Clock, client: 'Check pending' },
  no_url: { label: 'No published URL', cls: 'bg-slate-50 text-slate-400 ring-slate-200', icon: Clock, client: 'Awaiting URL' },
}

/** Badge for a placement's latest link check; the note explains any problem. */
export function LinkVerdict({ verdict, check, clientFacing }) {
  const v = VERDICT[verdict] || VERDICT.pending
  const Icon = v.icon
  const title = check ? `${check.note || v.label}\nChecked ${fmtDate(check.checkedAt)}${check.httpStatus ? ` · HTTP ${check.httpStatus}` : ''}` : v.label
  return (
    <span title={clientFacing ? '' : title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${v.cls}`}>
      <Icon size={11} /> {clientFacing ? v.client : v.label}
    </span>
  )
}

/** Last checks as dots, oldest → newest. */
export function LinkHistory({ history = [] }) {
  if (!history.length) return <span className="text-xs text-slate-300">—</span>
  const color = { ok: 'bg-emerald-500', changed: 'bg-amber-400', lost: 'bg-rose-500', page_down: 'bg-rose-500', unverified: 'bg-slate-300' }
  return (
    <span className="inline-flex items-center gap-0.5">
      {history.slice(-12).map((h, i) => <span key={i} title={`${fmtDate(h.at)}: ${h.verdict}${h.follow ? ` (${h.follow})` : ''}`} className={`h-2.5 w-1.5 rounded-sm ${color[h.verdict] || 'bg-slate-300'}`} />)}
    </span>
  )
}
