import { useEffect } from 'react'
import { X } from 'lucide-react'

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-6 pt-16" onMouseDown={onClose}>
      <div className={`card w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} shadow-xl`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button className="rounded p-1 text-slate-500 hover:bg-slate-100" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

export const STAGE_COLOR = {
  Prospecting: 'bg-slate-100 text-slate-700',
  Contacted: 'bg-sky-100 text-sky-700',
  Replied: 'bg-cyan-100 text-cyan-700',
  Negotiating: 'bg-amber-100 text-amber-700',
  'Content Sent': 'bg-violet-100 text-violet-700',
  Accepted: 'bg-indigo-100 text-indigo-700',
  Published: 'bg-emerald-100 text-emerald-700',
  Live: 'bg-green-100 text-green-800',
  Rejected: 'bg-rose-100 text-rose-700',
}

export function StageBadge({ status }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STAGE_COLOR[status] || 'bg-slate-100 text-slate-700'}`}>{status}</span>
}

export function NicheChip({ name }) {
  return <span className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">{name}</span>
}

export function Metric({ value, good = 50, ok = 30 }) {
  if (value === null || value === undefined) return <span className="text-slate-400">—</span>
  const c = value >= good ? 'text-emerald-700 font-semibold' : value >= ok ? 'text-amber-700' : 'text-slate-600'
  return <span className={c}>{value}</span>
}

export function Empty({ children }) {
  return <div className="card px-6 py-10 text-center text-sm text-slate-500">{children}</div>
}

export function PageHeader({ title, sub, children }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        {sub && <p className="text-sm text-slate-500">{sub}</p>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}
