// Live-link recheck — opens a published guest post and confirms the client's
// link is still there, still followed, still on an indexable page.
//
// Verdicts, worst first:
//   lost        page loads but the link to the client is gone
//   page_down   the article itself is 404/410/5xx or the domain is gone
//   changed     link is there but now nofollow/sponsored/ugc, the anchor was
//               edited, or the page was set to noindex
//   unverified  a firewall blocked the check, or it timed out: try again later
//   ok          link present, followed, anchor as agreed, page indexable

import { get, BLOCKED } from './enrich.js'

const bare = (u) => {
  try {
    const x = new URL(u)
    return (x.hostname.replace(/^www\./, '') + x.pathname.replace(/\/+$/, '')).toLowerCase()
  } catch { return String(u || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '') }
}
const hostOf = (u) => { try { return new URL(/^https?:/i.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, '').toLowerCase() } catch { return '' } }
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
const textOf = (html) => decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()

/** Every <a href> on the page with its rel and visible text. */
function anchors(html, base) {
  const out = []
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi
  let m
  while ((m = re.exec(html))) {
    const attrs = m[1]
    const href = (attrs.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i) || []).slice(1).find(Boolean)
    if (!href) continue
    let abs
    try { abs = new URL(decode(href), base).href } catch { continue }
    const rel = ((attrs.match(/\brel\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i) || []).slice(1).find(Boolean) || '').toLowerCase()
    out.push({ href: abs, rel, text: textOf(m[2]) })
  }
  return out
}

/**
 * @param {object} o  { publishedUrl, targetUrl, anchorText, clientWebsite }
 * targetUrl wins; with no targetUrl, any link to the client's domain counts.
 */
export async function checkLink(o, { timeoutMs = 20000 } = {}) {
  const res = { checkedAt: new Date().toISOString(), verdict: 'unverified', httpStatus: null, linkFound: false, matchedHref: '', rel: '', follow: null, anchorSeen: '', anchorMatches: null, noindex: false, canonical: '', note: '' }
  if (!o.publishedUrl) return { ...res, note: 'No published URL' }
  const targetHost = hostOf(o.targetUrl || o.clientWebsite || '')
  if (!targetHost) return { ...res, note: 'Set a target URL (or the client website) so the check knows which link to look for' }

  let r
  try { r = await get(o.publishedUrl, timeoutMs, 3_000_000) } catch (e) {
    const code = e?.code || e?.name || 'error'
    res.note = code === 'AbortError' ? 'timed out' : code
    if (['ENOTFOUND', 'ECONNREFUSED'].includes(code)) res.verdict = 'page_down'
    return res
  }
  res.httpStatus = r.status
  if (BLOCKED.has(r.status)) { res.note = 'blocked the check (firewall)'; return res }
  if (r.status >= 400) { res.verdict = 'page_down'; res.note = `HTTP ${r.status}`; return res }

  const html = r.html
  const robots = (html.match(/<meta[^>]+name=["']robots["'][^>]*>/i) || [''])[0] + ' ' + (r.headers['x-robots-tag'] || '')
  res.noindex = /noindex/i.test(robots)
  const canon = (html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)/i) || html.match(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["']canonical["']/i) || [])[1]
  if (canon && bare(new URL(canon, r.finalUrl).href) !== bare(r.finalUrl)) res.canonical = canon

  const links = anchors(html, r.finalUrl)
  const want = o.targetUrl ? bare(o.targetUrl) : null
  // Exact target page first; fall back to any link to the client's domain so
  // a link that was re-pointed to the homepage reads as "changed", not "lost".
  const exact = want ? links.find((a) => bare(a.href) === want) : null
  const sameHost = links.find((a) => hostOf(a.href) === targetHost || hostOf(a.href).endsWith(`.${targetHost}`))
  const hit = exact || sameHost
  if (!hit) { res.verdict = 'lost'; res.note = `No link to ${o.targetUrl || targetHost} on the page`; return res }

  res.linkFound = true
  res.matchedHref = hit.href
  res.rel = hit.rel
  res.follow = /sponsored/.test(hit.rel) ? 'sponsored' : /ugc/.test(hit.rel) ? 'ugc' : /nofollow/.test(hit.rel) ? 'nofollow' : 'dofollow'
  res.anchorSeen = hit.text.slice(0, 120)
  if (o.anchorText) res.anchorMatches = hit.text.toLowerCase().includes(o.anchorText.trim().toLowerCase())

  const problems = []
  if (want && !exact) problems.push('link now points to a different page on the client site')
  if (res.follow !== 'dofollow') problems.push(`link is ${res.follow}`)
  if (res.anchorMatches === false) problems.push(`anchor changed to "${res.anchorSeen}"`)
  if (res.noindex) problems.push('page is set to noindex')
  if (res.canonical) problems.push('page canonicalises to another URL')
  res.verdict = problems.length ? 'changed' : 'ok'
  res.note = problems.join('; ')
  return res
}
