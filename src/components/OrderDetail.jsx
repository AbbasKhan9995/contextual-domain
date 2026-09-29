import { useRef, useState } from 'react'
import { Trash2, Upload, FileText, Download, X, ExternalLink, CheckCircle2, Circle, Mail, CalendarClock } from 'lucide-react'
import { api, fmtDate, fmtMoney } from '../lib/api.js'
import { Modal } from './ui.jsx'
import { LinkVerdict } from './LinkVerdict.jsx'
import { useSession } from '../lib/session.js'

const toDateInput = (s) => (s ? s.slice(0, 10) : '')
const toIso = (d) => (d ? new Date(d).toISOString() : null)
const kb = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)
const TABS = [['content', 'Content'], ['link', 'Link'], ['money', 'Money'], ['publisher', 'Publisher'], ['activity', 'Activity']]

/** The full record for one placement. Everything the publisher, the client
 *  and your books need, in five tabs, saved together. */
export default function OrderDetail({ order, stages, onClose, onChange }) {
  const storage = useSession()?.storage || 'local'
  const [o, setO] = useState(() => ({ ...order, targetKeywordsText: (order.targetKeywords || []).join(', ') }))
  const [guidelines, setGuidelines] = useState(order.site?.guidelines || '')
  const [contact, setContact] = useState(order.site?.contactEmail || '')
  const [tab, setTab] = useState('content')
  const [busy, setBusy] = useState(false)
  const [upBusy, setUpBusy] = useState(false)
  const [err, setErr] = useState('')
  const [drag, setDrag] = useState(false)
  const fileRef = useRef(null)
  const set = (k) => (e) => setO((s) => ({ ...s, [k]: e.target.value }))

  const save = async () => {
    setBusy(true); setErr('')
    try {
      const r = await api.updateOrder(o.id, {
        status: o.status, priceAgreed: o.priceAgreed, clientPrice: o.clientPrice, type: o.type,
        articleTitle: o.articleTitle, targetKeywords: o.targetKeywordsText, contentBy: o.contentBy, wordCount: o.wordCount,
        targetUrl: o.targetUrl, anchorText: o.anchorText, draftUrl: o.draftUrl, publishedUrl: o.publishedUrl, notes: o.notes,
        followUpAt: toIso(o.followUpAt), lastContactedAt: toIso(o.lastContactedAt), publishedAt: toIso(o.publishedAt),
        deadlineAt: toIso(o.deadlineAt), publisherPaidAt: toIso(o.publisherPaidAt), clientPaidAt: toIso(o.clientPaidAt),
      })
      // Guidelines and contact belong to the publisher, so they're saved on the site and every order for it sees them.
      if (o.site && (guidelines !== (order.site.guidelines || '') || contact !== (order.site.contactEmail || ''))) {
        await api.updateSite(o.site.id, { guidelines, contactEmail: contact })
      }
      // A new or changed published URL gets its link checked straight away.
      if (r.recheck) api.checkLinks([o.id]).catch(() => {})
      onChange(r.order); onClose()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  const del = async () => { if (confirm('Remove this from the pipeline? Uploaded files are deleted too.')) { await api.deleteOrder(o.id); onChange(null); onClose() } }

  const upload = async (files) => {
    setUpBusy(true); setErr('')
    try {
      let last
      for (const f of files) last = await api.uploadOrderFile(o.id, f, storage)
      if (last) setO((s) => ({ ...s, files: last.order.files }))
    } catch (e) { setErr(e.message) } finally { setUpBusy(false) }
  }
  const removeFile = async (name) => {
    if (!confirm(`Delete ${name}?`)) return
    const r = await api.deleteOrderFile(o.id, name)
    setO((s) => ({ ...s, files: r.order.files }))
  }

  // Readiness is recomputed live from the form, not the saved copy.
  const checks = [
    ['Article title / topic', !!o.articleTitle],
    ['Article (Google Doc or file)', !!(o.draftUrl || o.files?.length || o.contentBy === 'publisher')],
    ['Target URL', !!o.targetUrl],
    ['Anchor text', !!o.anchorText],
    ['Target keywords', !!o.targetKeywordsText.trim()],
  ]
  const ready = checks.filter(([, v]) => v).length
  const cost = o.priceAgreed === '' || o.priceAgreed == null ? null : Number(o.priceAgreed)
  const sell = o.clientPrice === '' || o.clientPrice == null ? null : Number(o.clientPrice)
  const margin = cost != null && sell != null ? sell - cost : null

  return (
    <Modal title={`${o.site?.name || '?'} → ${o.client?.name || '?'}`} onClose={onClose} wide>
      <div className="-mt-1 mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <a href={`https://${o.site?.url}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-indigo-600 hover:underline">{o.site?.url} <ExternalLink size={10} /></a>
        <span>DR {o.site?.dr ?? '—'} · DA {o.site?.da ?? '—'}</span>
        <span>list {fmtMoney(o.site?.priceGuestPost)}</span>
        {o.site?.tat && <span>TAT {o.site.tat}</span>}
        {o.site?.linkType && <span>{o.site.linkType}</span>}
      </div>

      <div className="mb-4 grid grid-cols-4 gap-3">
        <div><label className="label">Stage</label>
          <select className="input" value={o.status} onChange={set('status')}>{stages.map((s) => <option key={s}>{s}</option>)}</select>
        </div>
        <div><label className="label">Type</label>
          <select className="input" value={o.type} onChange={set('type')}><option value="guest_post">Guest post</option><option value="link_insert">Link insert</option></select>
        </div>
        <div><label className="label">Deadline</label><input className="input" type="date" value={toDateInput(o.deadlineAt)} onChange={set('deadlineAt')} /></div>
        <div><label className="label">Follow-up due</label><input className="input" type="date" value={toDateInput(o.followUpAt)} onChange={set('followUpAt')} /></div>
      </div>

      {/* Readiness: what's still missing before this can go to the publisher. */}
      <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-700">Ready to send to publisher</span>
          <span className={`font-bold tabular-nums ${ready === checks.length ? 'text-emerald-700' : 'text-slate-600'}`}>{ready}/{checks.length}</span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {checks.map(([label, okk]) => (
            <span key={label} className={`inline-flex items-center gap-1 text-xs ${okk ? 'text-emerald-700' : 'text-slate-400'}`}>{okk ? <CheckCircle2 size={12} /> : <Circle size={12} />} {label}</span>
          ))}
        </div>
      </div>

      <div className="mb-3 flex gap-1 border-b border-slate-200">
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-3 py-1.5 text-sm font-medium ${tab === k ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {l}{k === 'content' && o.files?.length ? <span className="ml-1 rounded bg-slate-100 px-1 text-[10px] text-slate-500">{o.files.length}</span> : null}
          </button>
        ))}
      </div>

      <div className="min-h-[260px]">
        {tab === 'content' && (
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2"><label className="label">Article title / topic</label><input className="input" value={o.articleTitle} onChange={set('articleTitle')} placeholder="How to get a trade licence in Dubai in 2026" /></div>
            <div><label className="label">Written by</label>
              <select className="input" value={o.contentBy} onChange={set('contentBy')}><option value="client">Client supplies</option><option value="us">We write it</option><option value="publisher">Publisher writes</option></select>
            </div>
            <div className="col-span-2"><label className="label">Target keywords (comma separated)</label><input className="input" value={o.targetKeywordsText} onChange={set('targetKeywordsText')} placeholder="trade licence dubai, business setup uae" /></div>
            <div><label className="label">Word count</label><input className="input" type="number" value={o.wordCount ?? ''} onChange={set('wordCount')} placeholder="1000" /></div>
            <div className="col-span-3"><label className="label">Google Doc link</label>
              <div className="flex gap-2">
                <input className="input" value={o.draftUrl} onChange={set('draftUrl')} placeholder="https://docs.google.com/document/d/…" />
                {o.draftUrl?.startsWith('http') && <a className="btn-ghost shrink-0" href={o.draftUrl} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Open</a>}
              </div>
            </div>
            <div className="col-span-3">
              <label className="label">Article files</label>
              <div
                onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); upload([...e.dataTransfer.files]) }}
                onClick={() => fileRef.current?.click()}
                className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-4 text-sm transition ${drag ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50'}`}>
                <Upload size={15} /> {upBusy ? 'Uploading…' : 'Drop the article here or click to browse · DOCX, PDF, images · up to 15 MB'}
                <input ref={fileRef} type="file" multiple hidden accept=".docx,.doc,.pdf,.odt,.rtf,.txt,.md,.html,.png,.jpg,.jpeg,.webp,.zip" onChange={(e) => { upload([...e.target.files]); e.target.value = '' }} />
              </div>
              {o.files?.length > 0 && (
                <div className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {o.files.map((f) => (
                    <div key={f.name} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                      <FileText size={14} className="shrink-0 text-slate-400" />
                      <span className="min-w-0 flex-1 truncate text-slate-800">{f.name}</span>
                      <span className="text-xs text-slate-400">{kb(f.size)} · {fmtDate(f.uploadedAt)}</span>
                      <a className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" href={api.orderFileUrl(o.id, f.name)} title="Download"><Download size={13} /></a>
                      <button className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => removeFile(f.name)} title="Delete"><X size={13} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'link' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label className="label">Target URL (client page to link to)</label><input className="input" value={o.targetUrl} onChange={set('targetUrl')} placeholder="https://client.com/service" /></div>
            <div><label className="label">Anchor text</label><input className="input" value={o.anchorText} onChange={set('anchorText')} /></div>
            <div><label className="label">Published on</label><input className="input" type="date" value={toDateInput(o.publishedAt)} onChange={set('publishedAt')} /></div>
            <div className="col-span-2"><label className="label">Published URL</label><input className="input" value={o.publishedUrl} onChange={set('publishedUrl')} placeholder="https://site.com/article" /></div>
            <div className="col-span-2 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600">
              {o.publishedUrl ? (
                <div className="flex flex-wrap items-center gap-2">
                  <LinkVerdict verdict={o.linkCheck?.verdict || 'pending'} check={o.linkCheck} />
                  <span>{o.linkCheck ? (o.linkCheck.note || 'Link present, dofollow, page indexable') : 'Checked automatically after you save'}</span>
                  {o.linkCheck && <span className="text-slate-400">· checked {fmtDate(o.linkCheck.checkedAt)}</span>}
                </div>
              ) : 'Once published, paste the article URL. The link is checked on save and every 30 days after that.'}
            </div>
          </div>
        )}

        {tab === 'money' && (
          <div className="grid grid-cols-3 gap-3">
            <div><label className="label">Publisher cost ($)</label><input className="input" type="number" value={o.priceAgreed ?? ''} onChange={set('priceAgreed')} /></div>
            <div><label className="label">Client price ($)</label><input className="input" type="number" value={o.clientPrice ?? ''} onChange={set('clientPrice')} /></div>
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Margin</div>
              <div className={`text-xl font-bold tabular-nums ${margin == null ? 'text-slate-300' : margin < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{margin == null ? '—' : fmtMoney(margin)}</div>
              {margin != null && sell > 0 && <div className="text-[11px] text-slate-500">{Math.round((margin / sell) * 100)}% of client price</div>}
            </div>
            <div><label className="label">Publisher paid on</label><input className="input" type="date" value={toDateInput(o.publisherPaidAt)} onChange={set('publisherPaidAt')} /></div>
            <div><label className="label">Client paid on</label><input className="input" type="date" value={toDateInput(o.clientPaidAt)} onChange={set('clientPaidAt')} /></div>
            <div className="flex items-end pb-2 text-xs text-slate-500">
              {['Published', 'Live'].includes(o.status) && !o.publisherPaidAt ? <span className="text-amber-700">Published but the publisher isn't marked paid</span> : null}
            </div>
          </div>
        )}

        {tab === 'publisher' && (
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Contact email</label>
                <div className="flex gap-2">
                  <input className="input" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="editor@site.com" />
                  {contact.includes('@') && <a className="btn-ghost shrink-0" href={`mailto:${contact}`}><Mail size={13} /></a>}
                </div>
              </div>
              <div><label className="label">Sample post</label>
                <div className="truncate pt-2 text-sm">{o.site?.sampleLink?.startsWith('http') ? <a className="text-indigo-600 hover:underline" href={o.site.sampleLink} target="_blank" rel="noreferrer">{o.site.sampleLink}</a> : <span className="text-slate-400">none on file</span>}</div>
              </div>
            </div>
            <div><label className="label">Publisher guidelines (saved on the site, shown on every order for it)</label>
              <textarea className="input h-40" value={guidelines} onChange={(e) => setGuidelines(e.target.value)} placeholder={'Word count, link rules, banned topics, image rules, sponsored tag, how many revisions…'} />
            </div>
          </div>
        )}

        {tab === 'activity' && (
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Last contacted</label><input className="input" type="date" value={toDateInput(o.lastContactedAt)} onChange={set('lastContactedAt')} /></div>
              <div className="flex items-end gap-1 pb-2 text-xs text-slate-500"><CalendarClock size={13} /> Created {fmtDate(o.createdAt)} · updated {fmtDate(o.updatedAt)}</div>
            </div>
            <div><label className="label">Notes</label><textarea className="input h-28" value={o.notes} onChange={set('notes')} /></div>
            {o.history?.length > 0 && (
              <div>
                <div className="label">Stage history</div>
                <ol className="border-l-2 border-slate-200 pl-3 text-xs text-slate-600">
                  {o.history.map((h, i) => <li key={i} className="py-0.5"><span className="font-medium text-slate-800">{h.status}</span> · {fmtDate(h.at)}</li>)}
                </ol>
              </div>
            )}
          </div>
        )}
      </div>

      {err && <div className="mt-3 rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
        <button className="btn-danger" onClick={del}><Trash2 size={14} /> Remove</button>
        <div className="flex gap-2"><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button></div>
      </div>
    </Modal>
  )
}
