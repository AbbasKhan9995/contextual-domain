import { useState } from 'react'
import { Send } from 'lucide-react'
import { fmtDate } from '../lib/api.js'

/** A request's conversation, shared by the client portal and the admin inbox.
 *  `me` is which side is looking ('client' | 'admin'): their own messages sit
 *  on the right. */
export default function Thread({ thread = [], me, onSend, placeholder = 'Write a reply…', disabled }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const send = async () => {
    if (!text.trim()) return
    setBusy(true); setErr('')
    try { await onSend(text.trim()); setText('') } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  return (
    <div>
      {thread.length > 0 && (
        <div className="mb-2 grid gap-1.5">
          {thread.map((m) => {
            const mine = m.from === me
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${mine ? 'rounded-br-md bg-indigo-600 text-white' : 'rounded-bl-md bg-slate-100 text-slate-800'}`}>
                  <div className="whitespace-pre-wrap break-words">{m.text}</div>
                  <div className={`mt-0.5 text-[10px] ${mine ? 'text-indigo-200' : 'text-slate-400'}`}>
                    {m.from === 'admin' ? (me === 'admin' ? 'You' : 'Contextual Domain') : (me === 'client' ? 'You' : m.name || 'Client')} · {fmtDate(m.at)}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {onSend && (
        <div className="flex items-end gap-2">
          <textarea className="input min-h-[40px] flex-1 !py-2" rows={1} value={text} disabled={disabled || busy} placeholder={placeholder}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send() }} />
          <button className="btn-primary !py-2" disabled={!text.trim() || busy || disabled} onClick={send} title="Send (Ctrl+Enter)"><Send size={14} /> Send</button>
        </div>
      )}
      {err && <div className="mt-1 text-xs text-rose-600">{err}</div>}
    </div>
  )
}
