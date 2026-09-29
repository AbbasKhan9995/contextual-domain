// Pulls every tab of the vendor's public Google Sheet and turns its messy,
// tab-specific layouts into import rows.
//
// Columns are classified by CONTENT — a domain, a "$150", "72h", "1 Do-Follow",
// Yes/No, a 0–100 integer, a "32.4K" — and header text only breaks ties
// (DA vs DR, guest-post vs link-insert price). That's deliberate: the header
// rows are split over 2–3 lines, merged, and in a couple of tabs sit one
// column off from the data beneath them, so trusting them alone mislabels.

import { domainOf, parseCsvRows } from './normalize.js'

export const DEFAULT_SHEET_ID = '1-qJOw9BrOxChIMweqJiaZS0m-cPf_hu018RfAEAnO0M'
const base = (id) => `https://docs.google.com/spreadsheets/d/${id}`

/* ── fetching ───────────────────────────────────────────────────────── */

const unescapeJs = (s) => s
  .replace(/\\x([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/\\(.)/g, '$1')

/** Tab names + gids, read from the htmlview page's sheet menu. */
export async function fetchTabs(id = DEFAULT_SHEET_ID) {
  const res = await fetch(`${base(id)}/htmlview`)
  if (!res.ok) throw new Error(`htmlview HTTP ${res.status}`)
  const html = await res.text()
  const out = [], seen = new Set()
  const re = /name:\s*"((?:[^"\\]|\\.)*)"[^}]*?gid:\s*"(\d+)"/g
  let m
  while ((m = re.exec(html))) {
    const gid = m[2]
    if (!seen.has(gid)) { seen.add(gid); out.push({ name: unescapeJs(m[1]).trim(), gid }) }
  }
  return out
}

/** One tab as a raw grid (array of string arrays). `headers=0` stops gviz
 *  from guessing a header row and gluing three rows into column names. */
export async function fetchTabGrid(gid, id = DEFAULT_SHEET_ID) {
  const res = await fetch(`${base(id)}/gviz/tq?tqx=out:csv&headers=0&gid=${gid}`)
  if (!res.ok) throw new Error(`gid ${gid} HTTP ${res.status}`)
  return parseCsvRows(await res.text())
}

/* ── cell typing ────────────────────────────────────────────────────── */

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim()
const DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/
const isDomain = (s) => { const d = domainOf(s); return !!d && DOMAIN_RE.test(d) }
// A full URL with a path is a sample article, not the site itself.
const isLink = (s) => /^https?:\/\//i.test(s) && /\/[^/\s]+/.test(s.replace(/^https?:\/\/[^/]+/i, ''))
const NUM_RE = /^\d[\d,]*(\.\d+)?\s*[kKmM]?\+?$/
const numish = (s) => NUM_RE.test(s)
// "$150", "150$" (one tab writes it that way), "$1,000", "NIL", "N/A".
const isPrice = (s) => /^\$\s*\d/.test(s) || /^\d[\d,]*(\.\d+)?\s*\$$/.test(s) || /^(nil|n\/?a|free)$/i.test(s)
const isInt100 = (s) => /^\d{1,3}$/.test(s) && Number(s) <= 100
const isTat = (s) => s === '-' || /\d\s*-?\s*\d*\s*(h\b|hrs?\b|hours?\b|days?\b|weeks?\b|months?\b)/i.test(s)
const isLinkType = (s) => /do-?\s?follow|no-?\s?follow|\d+\s*links?\b/i.test(s)
const isYesNo = (s) => /^(yes|no|y|n)$/i.test(s)

export const parseNum = (s) => {
  const m = clean(s).replace(/[$,\s]/g, '').replace(/\+$/, '').match(/^(\d+(?:\.\d+)?)([kKmM])?$/)
  if (!m) return null
  let n = Number(m[1])
  if (m[2]) n *= /k/i.test(m[2]) ? 1e3 : 1e6
  return Math.round(n)
}

function cellType(v) {
  const s = clean(v)
  if (!s) return null
  if (isLink(s)) return 'link'
  if (isDomain(s)) return 'domain'
  if (isPrice(s)) return 'price'
  if (isTat(s)) return 'tat'
  if (isLinkType(s)) return 'linktype'
  if (isYesNo(s)) return 'yesno'
  if (numish(s)) {
    if (isInt100(s)) return 'int100'
    // "4.1", "0.2": neither a DA/DR integer nor a traffic figure. Kept apart
    // so a block of them can't tip a column either way.
    const n = parseNum(s)
    return n !== null && n <= 100 ? 'decimal' : 'number'
  }
  return 'text'
}

/* ── column analysis ────────────────────────────────────────────────── */

function analyse(grid) {
  const W = Math.max(0, ...grid.map((r) => r.length))
  const rows = grid.map((r) => Array.from({ length: W }, (_, i) => clean(r[i])))

  // The URL column is whichever holds the most bare domains.
  const domCount = Array(W).fill(0)
  for (const r of rows) r.forEach((c, i) => { if (c && !isLink(c) && isDomain(c)) domCount[i]++ })
  const urlCol = domCount.indexOf(Math.max(...domCount))
  if (urlCol < 0 || domCount[urlCol] === 0) return null

  const isData = (r) => !!r[urlCol] && isDomain(r[urlCol])
  const firstData = rows.findIndex(isData)
  const dataRows = rows.filter(isData)
  const header = Array.from({ length: W }, (_, i) =>
    rows.slice(0, firstData).map((r) => r[i]).filter(Boolean).join(' ').toLowerCase())

  const fill = Array(W).fill(0)
  const votes = Array.from({ length: W }, () => ({}))
  const samples = Array.from({ length: W }, () => ({}))
  const round5 = Array(W).fill(0) // 0–100 integers divisible by 5
  for (const r of dataRows) r.forEach((c, i) => {
    if (!c) return
    fill[i]++
    const t = cellType(c)
    votes[i][t] = (votes[i][t] || 0) + 1
    if (t === 'int100' && Number(c) % 5 === 0) round5[i]++
    if (!samples[i][t]) samples[i][t] = []
    if (samples[i][t].length < 3) samples[i][t].push(c.slice(0, 24))
  })

  // Header shifted one column right of its data (a column was inserted in the
  // sheet without moving the header): empty header over a filled column, next
  // header over an empty one.
  for (let i = 0; i < W - 1; i++) {
    if (!header[i] && header[i + 1] && fill[i] > 0 && fill[i + 1] <= dataRows.length * 0.1) {
      header[i] = header[i + 1]; header[i + 1] = ''
    }
  }

  const type = votes.map((v, i) => {
    if (!fill[i]) return null
    const n = (t) => v[t] || 0
    const numericish = n('int100') + n('number') + n('price') + n('decimal')
    // A labelled price column is one even when most rows say "on request".
    if (/price|\$|guest|insert|cost/.test(header[i]) && (numericish >= fill[i] * 0.6 || n('price') >= fill[i] * 0.1)) return 'price'
    // Mostly numeric with a real share of "$": a price column — unless bare
    // 0–100 integers outnumber the "$" cells AND aren't round numbers. Bare
    // prices are round (50, 70, 100, 150); DA/DR values aren't. That's a DA
    // column with "$" cells leaked in from rows laid out differently.
    const roundish = n('int100') ? round5[i] / n('int100') : 1
    if (n('price') >= fill[i] * 0.3 && numericish >= fill[i] * 0.6) {
      return n('int100') > n('price') && roundish < 0.5 ? 'int100' : 'price'
    }
    // Traffic: DA/DR never exceed 100, so a real share of bigger (or K/M)
    // values marks traffic — provided the column is numeric at all.
    if ((n('number') >= fill[i] * 0.15 || n('number') > n('int100')) && n('number') + n('int100') >= fill[i] * 0.3) return 'number'
    let best = null, top = 0
    for (const [t, c] of Object.entries(v)) if (c > top) { best = t; top = c }
    if (best === 'decimal') best = n('int100') ? 'int100' : 'number'
    if (best === 'text' && /categor|niche|genre|allowed|topic/.test(header[i])) return 'category'
    return best
  })

  return { rows, urlCol, firstData, dataRows, header, fill, type, votes, samples }
}

const NAME_HDR = /name|publication|website|domain names|\bsite\b|south africa|nigeria|blog/
const ADMIN_TAG = /^(new|admin|pmp|author|team|n\/a)\b/i

function assign(a) {
  const { header, type, urlCol, fill, dataRows } = a
  const idx = (t) => type.map((x, i) => (x === t ? i : -1)).filter((i) => i >= 0)
  const cols = { url: urlCol }

  // Name: the nearest text column left of the URL — but only if it holds
  // names, not the "new" / "NEW pmp" / "M M" admin tags some tabs keep there.
  for (let i = urlCol - 1; i >= 0; i--) {
    if (!fill[i] || type[i] !== 'text') continue
    if (NAME_HDR.test(header[i])) { cols.name = i; break }
    const vals = dataRows.map((r) => r[i]).filter(Boolean)
    const good = vals.filter((v) => !ADMIN_TAG.test(v) && !v.split(' ').every((t) => t.length <= 3)).length
    if (good >= vals.length * 0.4 && vals.length >= dataRows.length * 0.4) cols.name = i
    break
  }

  // DA then DR left-to-right in every tab seen; the one exception is a tab
  // whose DA column is empty and only DR remains — the header settles that.
  const ints = idx('int100')
  if (ints.length === 1 && /\bdr\b|ahref/.test(header[ints[0]]) && !/\bda\b|moz/.test(header[ints[0]])) cols.dr = ints[0]
  else { if (ints[0] !== undefined) cols.da = ints[0]; if (ints[1] !== undefined) cols.dr = ints[1] }
  // A metric column that is nearly all zeros is not DA/DR (it's the vendor's
  // "0 traffic on the free plan" or a placeholder).
  const mostlyZero = (i) => {
    const vals = dataRows.map((r) => r[i]).filter(Boolean)
    return vals.length > 0 && vals.filter((x) => /^0+$/.test(x)).length >= vals.length * 0.8
  }
  if (cols.dr !== undefined && mostlyZero(cols.dr)) delete cols.dr
  if (cols.da !== undefined && mostlyZero(cols.da)) delete cols.da

  // Traffic: the numeric column labelled as such, else the fullest one.
  const nums = idx('number')
  cols.traffic = nums.find((i) => /traffic|visit|organic/.test(header[i]))
    ?? nums.slice().sort((x, y) => fill[y] - fill[x])[0]

  const prices = idx('price')
  const li = prices.find((i) => /insert/.test(header[i]))
  if (prices.length === 1) { if (li !== undefined) cols.li = li; else cols.gp = prices[0] }
  else if (prices.length > 1) {
    cols.gp = prices.find((i) => i !== li) ?? prices[0]
    cols.li = li ?? prices.find((i) => i !== cols.gp)
  }
  // "PRICES" is one merged header over GUEST POST | LINK INSERT. When only the
  // link-insert half is labelled and the guest-post half is bare numbers, the
  // unlabelled numeric column directly to its left is the guest-post price.
  if (cols.li !== undefined && cols.gp === undefined) {
    const left = cols.li - 1
    if (left > urlCol && type[left] === 'number' && left !== cols.traffic) cols.gp = left
  }

  cols.tat = idx('tat')[0]
  cols.linkType = idx('linktype')[0]
  cols.sample = idx('link')[0]
  const yn = idx('yesno')
  cols.indexed = yn.find((i) => /index/.test(header[i])) ?? yn.find((i) => !/sponsor|image|follow/.test(header[i]))
  cols.tags = idx('category')
  return cols
}

/* ── section labels ─────────────────────────────────────────────────── */

// Tabs group sites under all-caps banner rows ("HEALTH, FITNESS, …",
// "TECHNOLOGY", "GAMES"). The first term becomes a tag for the rows below.
const SECTION_RE = /^[A-Z0-9][A-Z0-9 &/-]{2,40}$/
function sectionLabel(r) {
  const nz = r.filter(Boolean)
  if (nz.length !== 1) return null
  const s = nz[0]
  if (isDomain(s) || /@|updated|contact|click|inquir/i.test(s)) return null
  const first = s.split(/[,|]/)[0].trim()
  return SECTION_RE.test(first) ? first : null
}

/* ── rows out ───────────────────────────────────────────────────────── */

/** Grid → import rows for /api/import, with the tab name as the niche. */
export function tabToRows(grid, niche) {
  const a = analyse(grid)
  if (!a) return { rows: [], cols: null }
  const c = assign(a)
  const get = (r, i) => (i === undefined || i < 0 ? '' : r[i])
  const out = []
  let section = null
  // Every value is validated against its column's type before it's used.
  // Blocks of rows inside a tab use a different layout from the rest, so a
  // "$150" can sit in the DA column: that becomes blank, not a DA of 150.
  const cell = (r, i, ok) => { const v = get(r, i); return v && ok(v) ? v : '' }
  const priceOf = (r, i) => {
    const v = get(r, i)
    if (/^nil$/i.test(v)) return 0 // vendor's explicit "not offered"
    return isPrice(v) || numish(v) ? parseNum(v) : null
  }
  for (const r of a.rows.slice(a.firstData)) {
    const sec = sectionLabel(r)
    if (sec) { section = sec; continue }
    if (!isDomain(get(r, c.url))) continue
    const tags = []
    for (const i of c.tags || []) {
      const v = get(r, i)
      if (isLink(v)) continue // a URL is never a tag
      tags.push(...v.split(/[,;|/]/))
    }
    if (section) tags.push(section)
    // Sample articles get parked in whatever column is free on that row.
    const sample = cell(r, c.sample, isLink) || r.find((v) => isLink(v)) || ''
    const nameV = get(r, c.name)
    const yn = cell(r, c.indexed, isYesNo)
    const tat = cell(r, c.tat, isTat)
    out.push({
      name: nameV && !isDomain(nameV) && !isLink(nameV) ? nameV : '',
      url: get(r, c.url),
      da: c.da !== undefined ? parseNum(cell(r, c.da, isInt100)) : null,
      dr: c.dr !== undefined ? parseNum(cell(r, c.dr, isInt100)) : null,
      traffic: c.traffic !== undefined ? parseNum(cell(r, c.traffic, numish)) : null,
      priceGuestPost: c.gp !== undefined ? priceOf(r, c.gp) : null,
      priceLinkInsert: c.li !== undefined ? priceOf(r, c.li) : null,
      tat: tat === '-' ? '' : tat,
      linkType: cell(r, c.linkType, isLinkType),
      sampleLink: sample,
      indexed: /^(y|yes)$/i.test(yn) ? 'Yes' : /^(n|no)$/i.test(yn) ? 'No' : '',
      niche,
      tags: tags.map((t) => t.trim()).filter((t) => t && t.length <= 40),
    })
  }
  return { rows: out, cols: c, header: a.header, type: a.type, fill: a.fill, votes: a.votes, samples: a.samples }
}
