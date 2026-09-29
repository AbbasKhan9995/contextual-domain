// Turns raw rows (from the vendor sheet, a CSV paste, or an API feed) into
// clean site records. Tolerant of header naming differences, so the same
// importer works whether the source says "MOZ DA" or "moz_da" or "da".

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()

const num = (v) => {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v).replace(/[$,\s]/g, '').trim()
  if (!s || /^nil$/i.test(s) || /^n\/?a$/i.test(s) || s === '-') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

// "NIL" is the vendor's explicit "not offered" — kept as 0 so it's distinct
// from blank (unknown) and can overwrite a stale price from another tab.
const price = (v) => (/^nil$/i.test(norm(v)) ? 0 : num(v))

const bool = (v) => {
  const s = norm(v).toLowerCase()
  if (!s) return null
  return ['yes', 'y', 'true', '1', 'indexed'].includes(s)
}

/** Strip protocol/www/trailing slash and any inline notes so the same site
 *  appearing in two niche tabs dedupes to one record. Rejects e-mail
 *  addresses (the sheet keeps the vendor's contact in the URL column). */
export function domainOf(raw) {
  let s = norm(raw).toLowerCase()
  if (!s || s.includes('@')) return ''
  s = s.replace(/^https?:\/\//, '').replace(/^www\./, '')
  // "msn.com ( 1 Year Guaranteed )" → "msn.com"; "businessday.ng Sponsored" → "businessday.ng"
  s = s.split(/[\s(]/)[0].replace(/\/.*$/, '')
  return s
}

/** Whatever trails the domain in the URL cell — "(Contributor Post)",
 *  "Sponsored", "( 6 months lifespan )" — kept as a short note. */
function noteOf(raw) {
  const s = norm(raw).replace(/^https?:\/\//i, '').replace(/^www\./i, '')
  const rest = s.replace(/^[^\s(/]+\/?/, '').trim()
  return rest.replace(/^\(\s*/, '').replace(/\s*\)$/, '').trim().slice(0, 80)
}

/** Pick the first matching header for a field, case/space-insensitive. */
const pick = (row, ...keys) => {
  const map = {}
  for (const k of Object.keys(row)) map[k.toLowerCase().replace(/[^a-z0-9]/g, '')] = row[k]
  for (const k of keys) {
    const v = map[k.toLowerCase().replace(/[^a-z0-9]/g, '')]
    if (v !== undefined && v !== null && norm(v) !== '') return v
  }
  return undefined
}

const splitList = (v) => (Array.isArray(v) ? v : String(v ?? '').split(/[,;|/]/))
  .map((t) => norm(t)).filter((t) => t && t.length <= 40)

const STOP_WORD = /^(or|and|of|the|with|for|to|in|on|at|a|an|etc)$/i
/** Category cells mostly hold real tags ("Fashion, Style") but some tabs put
 *  free-text guidelines there ("Topics should focus on WordPress or Divi") or
 *  banner notes ("WRITING COST IS INCLUDED"). A tag is short — three words,
 *  or up to five for a compound category joined by "&"/"and" ("Radio & Audio
 *  Technology") — never starts with a conjunction, and is never a URL. */
export const cleanTags = (v) => Array.from(new Set(
  (Array.isArray(v) ? v : String(v ?? '').split(/[,;|/]/))
    .map((t) => norm(t).replace(/^[-–•*]+\s*/, ''))
    .filter((t) => {
      if (!t || t.length > 34 || /^https?:/i.test(t)) return false
      const words = t.split(' ')
      if (STOP_WORD.test(words[0])) return false
      const compound = /(^|\s)(&|and)(\s|$)/i.test(t)
      return words.length <= (compound ? 5 : 3)
    }),
))

export function normalizeRow(row, defaultNiche = '') {
  const urlRaw = pick(row, 'url', 'website', 'domain', 'site', 'link')
  const domain = domainOf(urlRaw)
  if (!domain || !domain.includes('.')) return null

  const name = norm(pick(row, 'name', 'websitesname', 'websitename', 'sitename', 'publication')) || domain
  const nicheRaw = pick(row, 'niche', 'niches', 'tab')
  const niches = nicheRaw !== undefined ? splitList(nicheRaw) : (defaultNiche ? [defaultNiche] : [])
  const tags = cleanTags(pick(row, 'tags', 'category', 'categoryallowed', 'categoryniche', 'categories', 'genre'))

  return {
    name,
    url: domain,
    note: noteOf(urlRaw),
    niches: Array.from(new Set(niches)),
    tags: Array.from(new Set(tags)),
    da: num(pick(row, 'da', 'mozda', 'moz')),
    dr: num(pick(row, 'dr', 'ahrefsdr')),
    traffic: num(pick(row, 'traffic', 'ahrefstraffic', 'organictraffic')),
    priceGuestPost: price(pick(row, 'priceguestpost', 'guestpost', 'gp', 'price', 'guestpostprice')),
    priceLinkInsert: price(pick(row, 'pricelinkinsert', 'linkinsert', 'li', 'linkinsertprice', 'insert')),
    tat: norm(pick(row, 'tat', 'turnaround', 'turnaroundtime')),
    linkType: norm(pick(row, 'linktype', 'links', 'dofollow')),
    indexed: bool(pick(row, 'indexed', 'index')),
    sampleLink: norm(pick(row, 'samplelink', 'sample', 'example')),
  }
}

/** Merge a fresh row into an existing record: newer metrics win, niches and
 *  tags union. A sparse row (just a URL under some tab) never blanks out data
 *  a fuller row already supplied. */
export function mergeSite(existing, incoming) {
  const union = (a, b) => Array.from(new Set([...(a || []), ...(b || [])]))
  const out = { ...existing }
  for (const k of ['name', 'note', 'da', 'dr', 'traffic', 'priceGuestPost', 'priceLinkInsert', 'tat', 'linkType', 'indexed', 'sampleLink']) {
    const v = incoming[k]
    if (v !== null && v !== undefined && v !== '' && !(k === 'name' && v === incoming.url && existing.name)) out[k] = v
  }
  out.niches = union(existing.niches, incoming.niches)
  out.tags = union(existing.tags, incoming.tags)
  return out
}

/** Minimal CSV/TSV parser (quoted fields, embedded commas and newlines).
 *  Returns rows as arrays of strings. */
export function parseCsvRows(text) {
  const rows = []
  let cur = [], field = '', q = false
  const push = () => { cur.push(field); field = '' }
  const end = () => { if (cur.length > 1 || cur[0] !== '') rows.push(cur); cur = [] }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else q = false }
      else field += c
    } else if (c === '"') q = true
    else if (c === ',' || c === '\t') push()
    else if (c === '\n') { push(); end() }
    else if (c !== '\r') field += c
  }
  push(); end()
  return rows
}

/** CSV → row objects keyed by the header line. */
export function parseCsv(text) {
  const rows = parseCsvRows(text)
  if (rows.length < 2) return []
  const header = rows[0].map((h) => h.trim())
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])))
}
