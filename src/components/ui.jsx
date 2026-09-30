import { useEffect } from 'react'
import { X } from 'lucide-react'

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/60 backdrop-blur-xs p-4 sm:p-6 pt-12 sm:pt-16 transition-opacity duration-200" onMouseDown={onClose}>
      <div className={`card w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} shadow-2xl animate-modal border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800/80 px-5 py-3.5">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{title}</h2>
          <button className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition-colors" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

export const STAGE_COLOR = {
  Prospecting: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  Contacted: 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300',
  Replied: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300',
  Negotiating: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  'Content Sent': 'bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300',
  Accepted: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300',
  Published: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  Live: 'bg-green-100 text-green-800 dark:bg-green-950/60 dark:text-green-300',
  Rejected: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
}

export function StageBadge({ status }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STAGE_COLOR[status] || 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}>{status}</span>
}

export function NicheChip({ name }) {
  return <span className="inline-block rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:text-slate-300">{name}</span>
}

export function Metric({ value, good = 50, ok = 30 }) {
  if (value === null || value === undefined) return <span className="text-slate-400 dark:text-slate-600">—</span>
  const c = value >= good ? 'text-emerald-700 dark:text-emerald-400 font-semibold' : value >= ok ? 'text-amber-700 dark:text-amber-400' : 'text-slate-600 dark:text-slate-400'
  return <span className={c}>{value}</span>
}

export function Empty({ children }) {
  return <div className="card px-6 py-10 text-center text-sm text-slate-500 dark:text-slate-400">{children}</div>
}

export function PageHeader({ title, sub, children }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">{title}</h1>
        {sub && <p className="text-sm text-slate-500 dark:text-slate-400">{sub}</p>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}
