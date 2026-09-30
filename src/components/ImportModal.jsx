import { useState, useRef, useEffect, useMemo } from 'react'
import { UploadCloud, FileText, CheckCircle2, AlertCircle, X, ChevronRight, Table, Sparkles, RefreshCw } from 'lucide-react'
import { Modal } from './ui.jsx'
import { api } from '../lib/api.js'

// Simple client-side CSV row parser for preview
function parsePreviewRows(text, max = 5) {
  if (!text || typeof text !== 'string') return { headers: [], rows: [], totalCount: 0 }
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (!lines.length) return { headers: [], rows: [], totalCount: 0 }

  const delimiter = lines[0].includes('\t') ? '\t' : ','
  const parseLine = (line) => {
    const row = []
    let inQuotes = false
    let current = ''
    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
      } else if (char === delimiter && !inQuotes) {
        row.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    row.push(current.trim())
    return row
  }

  const headers = parseLine(lines[0])
  const rows = []
  for (let i = 1; i < Math.min(lines.length, max + 1); i++) {
    rows.push(parseLine(lines[i]))
  }
  return {
    headers,
    rows,
    totalCount: lines.length - 1,
    delimiter: delimiter === '\t' ? 'TSV' : 'CSV',
  }
}

export default function ImportModal({ onClose, onDone, niches }) {
  const [mode, setMode] = useState('upload') // 'upload' | 'paste'
  const [csv, setCsv] = useState('')
  const [fileName, setFileName] = useState('')
  const [fileSize, setFileSize] = useState(0)
  const [niche, setNiche] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [err, setErr] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef(null)

  const preview = useMemo(() => parsePreviewRows(csv, 4), [csv])

  const detectedColumns = useMemo(() => {
    if (!preview.headers.length) return []
    const h = preview.headers.map((s) => s.toLowerCase())
    return [
      { key: 'url', label: 'Domain/URL', found: h.some((x) => /url|website|domain|site/.test(x)) },
      { key: 'metrics', label: 'DR / DA', found: h.some((x) => /dr|da|ahrefs|moz/.test(x)) },
      { key: 'traffic', label: 'Traffic', found: h.some((x) => /traffic|visits/.test(x)) },
      { key: 'price', label: 'Price', found: h.some((x) => /price|guest|cost|\$/.test(x)) },
      { key: 'niche', label: 'Genre/Niche', found: h.some((x) => /niche|genre|category/.test(x)) },
    ]
  }, [preview.headers])

  const handleFile = (file) => {
    if (!file) return
    setErr('')
    setResult(null)
    setFileName(file.name)
    setFileSize(file.size)

    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target.result
      if (typeof text === 'string') {
        setCsv(text)
      }
    }
    reader.onerror = () => {
      setErr('Failed to read the file. Please try again.')
    }
    reader.readAsText(file)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer?.files?.[0]
    if (file) {
      handleFile(file)
    }
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const clearFile = () => {
    setCsv('')
    setFileName('')
    setFileSize(0)
    setResult(null)
    setErr('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const run = async () => {
    if (!csv.trim()) {
      setErr('Please select a file or paste CSV data first.')
      return
    }
    setBusy(true)
    setErr('')
    setResult(null)
    try {
      const r = await api.importRows({ csv, niche, source: fileName ? `file:${fileName}` : 'paste' })
      setResult(r)
      onDone?.()
    } catch (e) {
      setErr(e.message || 'Import failed. Please check the file formatting.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Import Sites" onClose={onClose} wide>
      <div className="space-y-4">
        {/* Mode Selector */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode('upload')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                mode === 'upload'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <UploadCloud size={14} /> Upload File (.csv, .tsv)
            </button>
            <button
              type="button"
              onClick={() => setMode('paste')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                mode === 'paste'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <FileText size={14} /> Paste Text Directly
            </button>
          </div>
          {preview.totalCount > 0 && (
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <CheckCircle2 size={13} /> {preview.totalCount} rows detected
            </span>
          )}
        </div>

        {/* Upload Mode */}
        {mode === 'upload' && !csv && (
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`group flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-all duration-200 ${
              isDragging
                ? 'border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/30'
                : 'border-slate-300 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-850/40 hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-slate-50 dark:hover:bg-slate-800/60'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.txt"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 shadow-sm transition-transform duration-200 group-hover:scale-110">
              <UploadCloud size={24} />
            </div>
            <div className="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-200">
              Drop your CSV file here, or <span className="text-indigo-600 dark:text-indigo-400 underline underline-offset-2">browse files</span>
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Supports CSV, TSV, or exported Google Sheets files. Sites are updated without duplicate entries.
            </div>
          </div>
        )}

        {/* Paste Mode */}
        {mode === 'paste' && !csv && (
          <div>
            <textarea
              className="input h-48 font-mono text-xs"
              placeholder={`Websites Name\tURL\tMOZ DA\tAhrefs DR\tAhrefs Traffic\tGuest Post\tTAT\tLink Type\nTechCrunch\ttechcrunch.com\t92\t93\t1,100,000\t$450\t7 Days\tDofollow`}
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
            />
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              Paste the table headers and rows directly from your spreadsheet.
            </p>
          </div>
        )}

        {/* Preview Section if CSV is loaded */}
        {csv && (
          <div className="space-y-3 animate-in fade-in duration-200">
            {/* File info bar */}
            <div className="flex flex-wrap items-center justify-between rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 px-4 py-2.5">
              <div className="flex items-center gap-2.5">
                <FileText size={18} className="text-indigo-500 dark:text-indigo-400" />
                <div>
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {fileName || 'Pasted CSV Data'}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {preview.totalCount} rows detected · {preview.delimiter} format
                    {fileSize ? ` · ${(fileSize / 1024).toFixed(1)} KB` : ''}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={clearFile}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
              >
                <X size={14} /> Clear / Replace
              </button>
            </div>

            {/* Detected Column Badges */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 mr-1">Columns detected:</span>
              {detectedColumns.map((col) => (
                <span
                  key={col.key}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                    col.found
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700/60'
                  }`}
                >
                  {col.found ? '✓' : '—'} {col.label}
                </span>
              ))}
            </div>

            {/* Mini Live Preview Table */}
            <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
              <div className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-850/60 px-3 py-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center justify-between">
                <span>Data Preview (first {Math.min(preview.rows.length, 4)} rows)</span>
                <span>Total: {preview.totalCount} rows</span>
              </div>
              <div className="max-h-44 overflow-x-auto overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300">
                    <tr>
                      {preview.headers.slice(0, 8).map((h, i) => (
                        <th key={i} className="px-3 py-1.5 font-semibold uppercase tracking-wider text-[10px] whitespace-nowrap">
                          {h || `Col ${i + 1}`}
                        </th>
                      ))}
                      {preview.headers.length > 8 && (
                        <th className="px-3 py-1.5 text-[10px] text-slate-400">+{preview.headers.length - 8} more</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {preview.rows.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                        {row.slice(0, 8).map((cell, cIdx) => (
                          <td key={cIdx} className="px-3 py-1.5 text-slate-700 dark:text-slate-300 truncate max-w-[160px]">
                            {cell || '—'}
                          </td>
                        ))}
                        {row.length > 8 && <td className="px-3 py-1.5 text-slate-400">…</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Niche Fallback & Action Button */}
        <div className="grid grid-cols-[1fr_auto] items-end gap-3 pt-2">
          <div>
            <label className="label">Default Niche / Genre (applied if column is missing)</label>
            <input
              className="input"
              list="niche-list"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              placeholder="e.g. Technology, Real Estate, News, Crypto…"
            />
            <datalist id="niche-list">
              {(niches || []).map((n) => (
                <option key={n.name} value={n.name} />
              ))}
            </datalist>
          </div>
          <button
            type="button"
            className="btn-primary !py-2 !px-5"
            disabled={busy || !csv.trim()}
            onClick={run}
          >
            {busy ? (
              <>
                <RefreshCw size={15} className="animate-spin" /> Importing…
              </>
            ) : (
              <>
                <Sparkles size={15} /> Import {preview.totalCount ? `${preview.totalCount} Sites` : 'Now'}
              </>
            )}
          </button>
        </div>

        {/* Error notification */}
        {err && (
          <div className="flex items-center gap-2 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 px-3.5 py-2.5 text-sm text-rose-700 dark:text-rose-300 animate-in fade-in">
            <AlertCircle size={16} className="shrink-0" />
            <span>{err}</span>
          </div>
        )}

        {/* Success notification */}
        {result && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900/60 px-3.5 py-2.5 text-sm text-emerald-800 dark:text-emerald-300 animate-in fade-in">
            <CheckCircle2 size={16} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div>
              <span className="font-semibold">Import Complete:</span>{' '}
              {result.added} added, {result.updated} updated
              {result.skipped > 0 ? `, ${result.skipped} skipped (no valid domain)` : ''}.
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
