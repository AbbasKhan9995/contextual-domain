// Site check — fetches each site's homepage and records what can be verified
// for free: does it load, does it redirect to another domain, is it a parked
// "domain for sale" page, and what language does the page declare.
//
// DR / DA / traffic / sample posts / indexed status are NOT filled here:
// those need Ahrefs/Moz/Google data or the vendor, and guessing them would be
// worse than leaving them blank.

import http from 'node:http'
import https from 'node:https'

const UA ='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'
const bare = (h) => String(h || '').toLowerCase().replace(/^www\./, '')
const PARKED = /(domain (is )?for sale|buy this domain|this domain may be for sale|hugedomains|sedoparking|dan\.com|afternic|parkingcrew|bodis\.com|domain has expired|this domain is parked)/i
// Statuses that mean "a firewall stopped the check", not "the site is down".
export const BLOCKED = new Set([401, 403, 406, 429, 503])

// Plain node:http(s), not fetch(). Node's fetch (undici) can emit an
// 'error' on an internal HTTP/2 stream when a site drops the connection
// after we stop reading — nothing can listen for it, and it crashed the
// whole API server mid-check. Here every socket error lands in reject().
function getOnce(url, timeoutMs, maxBytes = 200_000) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https:') ? https : http
    const req = lib.get(url, { headers: { 'user-agent': UA, accept: 'text/html,*/*', 'accept-encoding': 'identity' }, timeout: timeoutMs }, (res) => {
      const status = res.statusCode || 0
      if (status >= 300 && status < 400 && res.headers.location) { res.resume(); resolve({ status, location: new URL(res.headers.location, url).href }); return }
      const headers = res.headers
      let html = ''
      res.setEncoding('utf8')
      // Only the head of the page is needed; stop reading after ~200 KB.
      res.on('data', (chunk) => { html += chunk; if (html.length > maxBytes) { res.destroy(); resolve({ status, html, headers }) } })
      res.on('end', () => resolve({ status, html, headers }))
      res.on('error', () => resolve({ status, html, headers }))
    })
    req.on('timeout', () => req.destroy(Object.assign(new Error('timed out'), { code: 'AbortError' })))
    req.on('error', reject)
  })
}

export async function get(url, timeoutMs, maxBytes) {
  for (let hop = 0; hop < 6; hop++) {
    const r = await getOnce(url, timeoutMs, maxBytes)
    if (!r.location) return { status: r.status, finalUrl: url, html: r.html, headers: r.headers || {} }
    url = r.location
  }
  return { status: 310, finalUrl: url, html: '' } // too many redirects
}

/** Check one domain. Returns only the fields the check actually established. */
export async function checkSite(domain, { timeoutMs = 15000 } = {}) {
  let r = null, error = null
  for (const scheme of ['https', 'http']) {
    try { r = await get(`${scheme}://${domain}/`, timeoutMs); break } catch (e) { error = e }
  }
  const out = { checkedAt: new Date().toISOString(), httpStatus: null, live: null, redirectHost: null, parked: false, langCode: null, langRegion: null, checkNote: '' }
  if (!r) {
    const code = error?.code || error?.cause?.code || error?.name || 'error'
    out.checkNote = code === 'AbortError' ? 'timed out' : code
    // No DNS / refused = gone. A timeout could be a slow firewall, so unknown.
    if (['ENOTFOUND', 'ECONNREFUSED', 'EAI_AGAIN', 'ERR_TLS_CERT_ALTNAME_INVALID'].includes(code)) out.live = false
    return out
  }
  out.httpStatus = r.status
  if (r.status < 400) out.live = true
  else if (BLOCKED.has(r.status)) out.checkNote = 'blocked the check (firewall)'
  else out.live = false

  const finalHost = bare(new URL(r.finalUrl).hostname)
  const d = bare(domain)
  // Same site on a subdomain (en.site.com) is fine; a different domain is not.
  if (finalHost && finalHost !== d && !finalHost.endsWith(`.${d}`) && !d.endsWith(`.${finalHost}`)) out.redirectHost = finalHost

  const head = r.html.slice(0, 200_000)
  const title = (head.match(/<title[^>]*>([^<]{0,200})/i) || [])[1] || ''
  if (PARKED.test(title) || PARKED.test(head.slice(0, 20_000))) { out.parked = true; out.live = false }

  const lang = head.match(/<html[^>]*\slang\s*=\s*["']?([a-z]{2,3})(?:[-_]([a-z]{2}))?/i)
    || head.match(/property=["']og:locale["'][^>]*content=["']([a-z]{2})_([a-z]{2})/i)
  if (lang) { out.langCode = lang[1].toLowerCase(); out.langRegion = lang[2] ? lang[2].toUpperCase() : null }
  return out
}

/** Runs the check across many sites with limited concurrency, calling
 *  onResult for each so the caller can persist as it goes. */
export async function runChecks(domains, { concurrency = 12, onResult, shouldStop = () => false, timeoutMs = 15000 } = {}) {
  let i = 0
  const worker = async () => {
    while (i < domains.length && !shouldStop()) {
      const d = domains[i++]
      let res
      try { res = await checkSite(d, { timeoutMs }) } catch (e) { res = { checkedAt: new Date().toISOString(), live: null, checkNote: String(e.message || e).slice(0, 80) } }
      onResult(d, res)
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
}
