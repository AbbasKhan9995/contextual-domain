// Guest Post Pro — the API as an Express app.
//
//   server/index.js   runs it on this PC (file storage, no logins)
//   api/index.js      runs it on Vercel (Postgres, Blob files, logins)
//
// Storage and auth switch on the environment; the routes are the same.

import express from 'express'
import cors from 'cors'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID, randomBytes, timingSafeEqual } from 'node:crypto'
import { fileURLToPath } from 'node:url'

import { createStore } from './lib/store.js'
import { normalizeRow, mergeSite, parseCsv, domainOf } from './lib/normalize.js'
import { SEED_ROWS } from './lib/seed.js'
import { derive } from './lib/derive.js'
import { runChecks } from './lib/enrich.js'
import { checkLink } from './lib/linkcheck.js'
import { DEFAULT_CATALOG, clientRow, renderCatalogHtml, refCode, sellPrice, maskDomain } from './lib/catalog.js'
import { COOKIE, hashPassword, verifyPassword, tempPassword, passwordProblem, makeToken, readToken, parseCookies, sessionCookie, publicUser } from './lib/auth.js'
import { fetchTabs, fetchTabGrid, tabToRows } from './lib/sheet.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

const PRODUCTION = process.env.NODE_ENV === 'production'
const ON_VERCEL = !!process.env.VERCEL
export const DATA_DIR = process.env.GP_DATA_DIR || path.join(ROOT, '.data')
const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || ''
// On Vercel the disk is read-only and wiped between calls: without a database
// there is nowhere safe to keep data, so refuse to start rather than half-work.
if (ON_VERCEL && !DATABASE_URL && !globalThis.__GP_TEST_DB) throw new Error('No database: connect a Neon Postgres database to this Vercel project (Storage tab), then redeploy.')
export const store = await createStore({ dataDir: DATA_DIR, databaseUrl: DATABASE_URL, db: globalThis.__GP_TEST_DB })
// Logins: always when hosted; locally only with GP_AUTH=1.
const AUTH = ON_VERCEL || store.mode === 'postgres' || process.env.GP_AUTH === '1'
const BLOB = !!process.env.BLOB_READ_WRITE_TOKEN
const SITE_BATCH = 30, LINK_BATCH = 6

export const STAGES = [
  'Prospecting', 'Contacted', 'Replied', 'Negotiating',
  'Content Sent', 'Accepted', 'Published', 'Live', 'Rejected',
]

const app = express()
app.set('trust proxy', true)
// Express 4 doesn't catch rejected promises from async handlers; wrap them all.
for (const m of ['get', 'post', 'patch', 'put', 'delete']) {
  const orig = app[m].bind(app)
  app[m] = (p, ...hs) => (hs.length ? orig(p, ...hs.map((h) => (typeof h === 'function' && h.length < 4
    ? (req, res, next) => { try { const r = h(req, res, next); if (r && typeof r.catch === 'function') r.catch(next) } catch (e) { next(e) } }
    : h))) : orig(p))
}
app.use(express.json({ limit: '8mb' }))
if (!PRODUCTION && !ON_VERCEL) app.use(cors({ origin: true }))
app.use('/api', store.middleware)

const ok = (res, data) => res.json({ ok: true, ...data })
const bad = (res, message, code = 400) => res.status(code).json({ ok: false, error: message })
const now = () => new Date().toISOString()

/* ── auth ───────────────────────────────────────────────────────────── */

// Logins are on whenever the app is hosted (Vercel or a database URL) and
// can be forced locally with GP_AUTH=1. Off otherwise: the local tool keeps
// working exactly as before, as a single admin.
const users = () => store.read('users', [])
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y) }

// The cookie-signing key is generated on first use and kept in the database,
// so there is no secret to copy into the hosting dashboard.
function sessionSecret() {
  const s = store.read('secrets', {})
  if (!s.session) { s.session = randomBytes(32).toString('hex'); store.write('secrets', s) }
  return s.session
}
const isSecure = (req) => ON_VERCEL || req.secure || req.get('x-forwarded-proto') === 'https'

function currentUser(req) {
  if (!AUTH) return { id: 'local', email: 'local', name: 'Local admin', role: 'admin' }
  const bearer = (req.get('authorization') || '').match(/^Bearer (.+)$/)?.[1]
  if (bearer && process.env.ADMIN_API_TOKEN && safeEq(bearer, process.env.ADMIN_API_TOKEN)) return { id: 'api', email: 'api', name: 'API token', role: 'admin' }
  const p = readToken(parseCookies(req.get('cookie'))[COOKIE], sessionSecret())
  return (p && users().find((u) => u.id === p.uid && !u.disabled)) || null
}
function startSession(req, res, u) {
  res.setHeader('Set-Cookie', sessionCookie(makeToken(u.id, sessionSecret()), { secure: isSecure(req) }))
}

app.get('/api/auth/me', (req, res) => {
  const u = currentUser(req)
  ok(res, {
    authEnabled: AUTH, user: publicUser(u), storage: BLOB ? 'blob' : 'local', mode: store.mode,
    needsSetup: AUTH && users().length === 0, setupEnabled: !!process.env.SETUP_CODE,
    client: u?.role === 'client' ? (({ id, name, website }) => ({ id, name, website }))(clients().find((c) => c.id === u.clientId) || {}) : null,
  })
})

// First admin. Only while no users exist, and only with the SETUP_CODE the
// owner set in the hosting dashboard, so nobody else can claim a fresh deploy.
app.post('/api/auth/setup', (req, res) => {
  if (!AUTH) return bad(res, 'Logins are off on this install.')
  if (users().length) return bad(res, 'Setup is already done. Log in instead.', 409)
  if (!process.env.SETUP_CODE) return bad(res, 'Set a SETUP_CODE environment variable in Vercel first, then redeploy.', 403)
  const { email, name, password, code } = req.body || {}
  if (!safeEq(String(code || ''), process.env.SETUP_CODE)) return bad(res, 'Setup code is wrong.', 403)
  const e = String(email || '').trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return bad(res, 'Enter a valid email.')
  const problem = passwordProblem(password)
  if (problem) return bad(res, problem)
  const u = { id: randomUUID(), email: e, name: String(name || e).trim().slice(0, 80), role: 'admin', passwordHash: hashPassword(password), createdAt: now(), lastLoginAt: now() }
  store.write('users', [u])
  startSession(req, res, u)
  ok(res, { user: publicUser(u) })
})

const DUMMY_HASH = hashPassword('timing-equaliser')
app.post('/api/auth/login', (req, res) => {
  if (!AUTH) return ok(res, { user: publicUser(currentUser(req)) })
  const email = String(req.body?.email || '').trim().toLowerCase()
  const list = users()
  const u = list.find((x) => x.email === email && !x.disabled)
  if (u?.lockedUntil && Date.parse(u.lockedUntil) > Date.now()) return bad(res, 'Too many wrong passwords. Try again in 15 minutes.', 429)
  // Same work for unknown emails, so response time doesn't reveal accounts.
  const good = verifyPassword(req.body?.password, u ? u.passwordHash : DUMMY_HASH) && !!u
  if (!good) {
    if (u) {
      u.failed = (u.failed || 0) + 1
      if (u.failed >= 8) { u.lockedUntil = new Date(Date.now() + 15 * 60e3).toISOString(); u.failed = 0 }
      store.write('users', list)
    }
    return bad(res, 'Email or password is wrong.', 401)
  }
  u.failed = 0; u.lockedUntil = null; u.lastLoginAt = now()
  store.write('users', list)
  startSession(req, res, u)
  ok(res, { user: publicUser(u) })
})

app.post('/api/auth/logout', (req, res) => { res.setHeader('Set-Cookie', sessionCookie('', { secure: isSecure(req), clear: true })); ok(res, {}) })

app.post('/api/auth/password', (req, res) => {
  const me = currentUser(req)
  if (!me || !AUTH || me.id === 'api') return bad(res, 'Log in first.', 401)
  const list = users()
  const u = list.find((x) => x.id === me.id)
  if (!verifyPassword(req.body?.current, u.passwordHash)) return bad(res, 'Current password is wrong.', 403)
  const problem = passwordProblem(req.body?.next)
  if (problem) return bad(res, problem)
  u.passwordHash = hashPassword(req.body.next); u.mustChangePassword = false; u.updatedAt = now()
  store.write('users', list)
  ok(res, { user: publicUser(u) })
})

// Everything below needs a login. Client accounts only reach /api/portal/*.
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/cron/')) return next()
  const u = currentUser(req)
  if (!u) return bad(res, 'Please log in.', 401)
  if (u.mustChangePassword) return bad(res, 'Set a new password first.', 403)
  req.user = u
  if (req.path.startsWith('/portal/')) return u.role === 'client' ? next() : bad(res, 'Client accounts only.', 403)
  if (u.role !== 'admin') return bad(res, 'Not allowed.', 403)
  next()
})

/* ── users (admin) ──────────────────────────────────────────────────── */

app.get('/api/users', (req, res) => {
  const cs = new Map(clients().map((c) => [c.id, c.name]))
  ok(res, { users: users().map((u) => ({ ...publicUser(u), clientName: cs.get(u.clientId) || null, disabled: !!u.disabled, lastLoginAt: u.lastLoginAt || null, createdAt: u.createdAt })) })
})
app.post('/api/users', (req, res) => {
  const { email, name, role = 'client', clientId = '' } = req.body || {}
  const e = String(email || '').trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return bad(res, 'Enter a valid email.')
  if (!['admin', 'client'].includes(role)) return bad(res, 'Role must be admin or client.')
  if (role === 'client' && !clients().some((c) => c.id === clientId)) return bad(res, 'Pick the client this login belongs to.')
  const list = users()
  if (list.some((u) => u.email === e)) return bad(res, 'That email already has a login.')
  const temp = tempPassword()
  const u = { id: randomUUID(), email: e, name: String(name || e).trim().slice(0, 80), role, clientId: role === 'client' ? clientId : null, passwordHash: hashPassword(temp), mustChangePassword: true, createdAt: now() }
  list.push(u); store.write('users', list)
  // Shown once to the admin, who passes it on; the user must change it at first login.
  ok(res, { user: publicUser(u), tempPassword: temp })
})
app.patch('/api/users/:id', (req, res) => {
  const list = users()
  const u = list.find((x) => x.id === req.params.id)
  if (!u) return bad(res, 'User not found.', 404)
  if (u.id === req.user.id && req.body?.disabled) return bad(res, "You can't disable your own login.")
  if ('name' in (req.body || {})) u.name = String(req.body.name).slice(0, 80)
  if ('disabled' in (req.body || {})) u.disabled = !!req.body.disabled
  let temp
  if (req.body?.resetPassword) { temp = tempPassword(); u.passwordHash = hashPassword(temp); u.mustChangePassword = true; u.failed = 0; u.lockedUntil = null }
  u.updatedAt = now()
  store.write('users', list)
  ok(res, { user: publicUser(u), tempPassword: temp })
})
app.delete('/api/users/:id', (req, res) => {
  if (req.params.id === req.user.id) return bad(res, "You can't delete your own login.")
  store.write('users', users().filter((u) => u.id !== req.params.id))
  ok(res, {})
})


/* ── data access ────────────────────────────────────────────────────── */

const sites = () => store.read('sites', [])
const orders = () => store.read('orders', [])
const clients = () => store.read('clients', [])
const meta = () => store.read('meta', { imports: [] })

/** Upsert a batch of raw rows. Returns counts. Dedupes by domain and unions
 *  niches, so the same site listed under three tabs becomes one record with
 *  three niche tags. */
function importRows(rows, { source = 'manual', defaultNiche = '' } = {}) {
  const list = sites()
  const byUrl = new Map(list.map((s) => [s.url, s]))
  let added = 0, updated = 0, skipped = 0
  for (const raw of rows) {
    const rec = normalizeRow(raw, defaultNiche)
    if (!rec) { skipped++; continue }
    const existing = byUrl.get(rec.url)
    if (existing) {
      Object.assign(existing, mergeSite(existing, rec), { updatedAt: now() })
      updated++
    } else {
      const s = { id: randomUUID(), ...rec, tags: rec.tags || [], notes: '', createdAt: now(), updatedAt: now() }
      list.push(s); byUrl.set(s.url, s); added++
    }
  }
  store.write('sites', list)
  const m = meta()
  m.imports.unshift({ at: now(), source, added, updated, skipped, total: rows.length })
  m.imports = m.imports.slice(0, 50)
  store.write('meta', m)
  return { added, updated, skipped }
}

// First run: seed with the rows already read from the vendor sheet.
if (store.mode === 'file' && !store.exists('sites')) {
  const r = importRows(SEED_ROWS, { source: 'seed' })
  console.log(`[seed] ${r.added} sites loaded from the sheet snapshot.`)
}

/* ── sites ──────────────────────────────────────────────────────────── */

// Range filters come in min/max pairs; a site with no value for a field is
// left out as soon as that field is filtered on (unknown ≠ matches).
const RANGES = [['da', 'Da'], ['dr', 'Dr'], ['traffic', 'Traffic'], ['priceGuestPost', 'Price'], ['tatDays', 'Tat']]

// Value = this site's guest-post price vs the median price of sites in the
// same DR band (0–9, 10–19 …). 0.5 means half the going rate for that
// authority. Only priced sites with a DR get a ratio.
function addValue(list) {
  const bands = new Map()
  for (const s of list) if (s.dr != null && s.priceGuestPost > 0) {
    const b = Math.floor(s.dr / 10)
    if (!bands.has(b)) bands.set(b, [])
    bands.get(b).push(s.priceGuestPost)
  }
  const median = new Map([...bands].map(([b, ps]) => { ps.sort((x, y) => x - y); return [b, ps[Math.floor(ps.length / 2)]] }))
  for (const s of list) {
    const m = s.dr != null && s.priceGuestPost > 0 && bands.get(Math.floor(s.dr / 10)).length >= 5 ? median.get(Math.floor(s.dr / 10)) : null
    s.valueRatio = m ? Math.round((s.priceGuestPost / m) * 100) / 100 : null
    s.bandMedian = m
  }
  return list
}
const withDerived = () => addValue(sites().map((s) => ({ ...s, ...derive(s) })))

function filterSites(list, q) {
  const text = String(q.q || '').toLowerCase()
  const niche = String(q.niche || '')
  const bounds = RANGES.map(([field, key]) => [field, num(q[`min${key}`]), num(q[`max${key}`])])
  // Back-compat: the old single "maxPrice" filter still works.
  if (q.maxPrice !== undefined && q.maxPrice !== '' && bounds[3][2] === null) bounds[3][2] = num(q.maxPrice)
  const indexed = q.indexed === 'yes' ? true : q.indexed === 'no' ? false : null
  const linkInsert = q.linkInsert === 'yes'
  const country = String(q.country || ''), language = String(q.language || ''), follow = String(q.follow || '')
  const sponsored = q.sponsored === 'yes' ? true : q.sponsored === 'no' ? false : null
  const live = String(q.live || '') // 'yes' | 'no' | 'unchecked'
  const flagged = String(q.flagged || '') // 'hide' | 'only'
  const [, priceMin, priceMax] = bounds[3]

  return list.filter((s) => {
    if (text && !(s.name.toLowerCase().includes(text) || s.url.includes(text) || s.niches.join(' ').toLowerCase().includes(text) || (s.tags || []).join(' ').toLowerCase().includes(text))) return false
    if (niche && !s.niches.includes(niche)) return false
    for (const [field, min, max] of bounds) {
      if (min === null && max === null) continue
      const v = s[field]
      if (v === null || v === undefined) return false
      if (min !== null && v < min) return false
      if (max !== null && v > max) return false
    }
    // A price filter skips NIL (0 = not offered) unless asked for 0 explicitly.
    if ((priceMin !== null || priceMax !== null) && s.priceGuestPost === 0 && priceMin !== 0) return false
    if (indexed !== null && s.indexed !== indexed) return false
    if (linkInsert && !s.priceLinkInsert) return false // null = unknown, 0 = NIL
    if (country === '__none' ? s.country : country && s.country !== country) return false
    if (language === '__none' ? s.language : language && s.language !== language) return false
    if (follow && s.follow !== follow) return false
    if (sponsored === true && !s.sponsored) return false
    if (sponsored === false && s.sponsored) return false
    if (live === 'yes' && s.live !== true) return false
    if (live === 'no' && s.live !== false) return false
    if (live === 'unchecked' && s.checkedAt) return false
    if (flagged === 'hide' && s.flags.length) return false
    if (flagged === 'only' && !s.flags.length) return false
    if (q.value === 'great' && !(s.valueRatio !== null && s.valueRatio <= 0.6)) return false
    return true
  })
}

app.get('/api/sites', (req, res) => {
  const q = req.query
  const sort = String(q.sort || 'dr'), dir = q.dir === 'asc' ? 1 : -1
  const orderIdx = new Map()
  for (const o of orders()) orderIdx.set(o.siteId, (orderIdx.get(o.siteId) || 0) + 1)
  const list = filterSites(withDerived(), q)
  list.sort((a, b) => {
    const av = a[sort], bv = b[sort]
    if (av === bv) return a.name.localeCompare(b.name)
    if (av === null || av === undefined) return 1
    if (bv === null || bv === undefined) return -1
    return (av > bv ? 1 : -1) * dir
  })
  ok(res, { sites: list.map((s) => ({ ...s, orderCount: orderIdx.get(s.id) || 0 })), total: sites().length })
})

// Dropdown options for the Sites filters, with counts.
app.get('/api/facets', (req, res) => {
  const count = (arr) => Object.entries(arr.reduce((m, v) => { if (v) m[v] = (m[v] || 0) + 1; return m }, {}))
    .sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, count: n }))
  const all = withDerived()
  ok(res, {
    countries: count(all.map((s) => s.country)),
    languages: count(all.map((s) => s.language)),
    flagged: all.filter((s) => s.flags.length).length,
  })
})

/* ── site check (enrichment) ────────────────────────────────────────── */

// One job at a time, run inside this process so its writes can't race the
// UI's edits: results are merged into a fresh read of sites.json in batches.
const CHECK_FIELDS = ['checkedAt', 'httpStatus', 'live', 'redirectHost', 'parked', 'langCode', 'langRegion', 'checkNote']
function coverage() {
  const d = withDerived()
  const filled = (f) => d.filter((s) => { const v = f(s); return v !== null && v !== undefined && v !== '' }).length
  const pct = (n) => ({ n, pct: d.length ? Math.round((n / d.length) * 100) : 0 })
  return {
    total: d.length,
    fields: {
      DA: pct(filled((s) => s.da)), DR: pct(filled((s) => s.dr)), Traffic: pct(filled((s) => s.traffic)),
      'Guest-post price': pct(filled((s) => s.priceGuestPost)), Turnaround: pct(filled((s) => s.tatDays)),
      'Link type': pct(filled((s) => s.follow)), 'Max links': pct(filled((s) => s.maxLinks)),
      Country: pct(filled((s) => s.country)), Language: pct(filled((s) => s.language)),
      'Sample post': pct(filled((s) => s.sampleLink)), Indexed: pct(filled((s) => s.indexed)),
      'Site checked': pct(filled((s) => s.checkedAt)),
    },
    live: { yes: d.filter((s) => s.live === true).length, no: d.filter((s) => s.live === false).length, unknown: d.filter((s) => s.checkedAt && s.live == null).length },
    flagged: d.filter((s) => s.flags.length).length,
  }
}

app.get('/api/enrich', (req, res) => ok(res, { coverage: coverage() }))

// One batch of the site check: sites never checked, or last checked before
// `before`. The Data health panel calls this in a loop and the daily cron
// calls it once. Results merge into a fresh, locked read of the sites, so a
// batch never overwrites an edit made meanwhile.
async function enrichBatch(before, size = SITE_BATCH) {
  const due = sites().filter((s) => !s.checkedAt || Date.parse(s.checkedAt) < before)
  const targets = due.slice(0, size).map((s) => s.url)
  const results = new Map()
  await runChecks(targets, { concurrency: 15, timeoutMs: 8000, onResult: (url, r) => results.set(url, r) })
  if (results.size) {
    await store.update('sites', (list) => {
      for (const s of list) { const r = results.get(s.url); if (r) for (const k of CHECK_FIELDS) s[k] = r[k] ?? null }
      return list
    })
  }
  const n = { live: 0, down: 0, unknown: 0 }
  for (const r of results.values()) n[r.live === true ? 'live' : r.live === false ? 'down' : 'unknown']++
  return { checked: results.size, remaining: Math.max(0, due.length - results.size), ...n }
}
// body: { before: ISO date } — 1970 = unchecked only; now-30d = stale; job start = everything
app.post('/api/enrich/batch', async (req, res) => {
  const before = Date.parse(req.body?.before || '1970-01-01') || 0
  ok(res, await enrichBatch(before, Math.min(SITE_BATCH, Math.max(5, Number(req.body?.size) || SITE_BATCH))))
})

app.get('/api/niches', (req, res) => {
  const counts = {}
  for (const s of sites()) for (const n of s.niches) counts[n] = (counts[n] || 0) + 1
  ok(res, { niches: Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })) })
})

app.post('/api/sites', (req, res) => {
  const rec = normalizeRow(req.body || {}, req.body?.niche || 'Uncategorised')
  if (!rec) return bad(res, 'A valid domain is required.')
  const list = sites()
  if (list.some((s) => s.url === rec.url)) return bad(res, `${rec.url} is already in the list.`)
  const s = { id: randomUUID(), ...rec, tags: rec.tags || [], notes: String(req.body.notes || ''), createdAt: now(), updatedAt: now() }
  list.push(s); store.write('sites', list)
  ok(res, { site: s })
})

app.patch('/api/sites/:id', (req, res) => {
  const list = sites()
  const s = list.find((x) => x.id === req.params.id)
  if (!s) return bad(res, 'Site not found.', 404)
  const allowed = ['name', 'note', 'niches', 'da', 'dr', 'traffic', 'priceGuestPost', 'priceLinkInsert', 'tat', 'linkType', 'indexed', 'sampleLink', 'notes', 'tags', 'contactEmail', 'guidelines']
  for (const k of allowed) if (k in req.body) s[k] = req.body[k]
  if ('url' in req.body) s.url = domainOf(req.body.url) || s.url
  s.updatedAt = now()
  store.write('sites', list)
  ok(res, { site: s })
})

app.delete('/api/sites/:id', async (req, res) => {
  const list = sites().filter((x) => x.id !== req.params.id)
  store.write('sites', list)
  await removeOrderFiles(orders().filter((o) => o.siteId === req.params.id).map((o) => o.id))
  store.write('orders', orders().filter((o) => o.siteId !== req.params.id))
  ok(res, {})
})

/* ── import ─────────────────────────────────────────────────────────── */

// Accepts { rows: [...] } (objects keyed by header), or { csv: "..." }, plus an
// optional { niche } applied to rows that carry no niche of their own. This is
// the endpoint a sheet/API feed posts to.
app.post('/api/import', (req, res) => {
  const { rows, csv, niche = '', source = 'api' } = req.body || {}
  let data = Array.isArray(rows) ? rows : []
  if (typeof csv === 'string' && csv.trim()) data = data.concat(parseCsv(csv))
  if (!data.length) return bad(res, 'Nothing to import — send rows[] or csv.')
  ok(res, importRows(data, { source, defaultNiche: niche }))
})

app.get('/api/import/history', (req, res) => ok(res, { imports: meta().imports }))

/* ── clients ────────────────────────────────────────────────────────── */

app.get('/api/clients', (req, res) => {
  const os = orders()
  ok(res, { clients: clients().map((c) => ({
    ...c,
    orders: os.filter((o) => o.clientId === c.id).length,
    live: os.filter((o) => o.clientId === c.id && o.status === 'Live').length,
  })) })
})

app.post('/api/clients', (req, res) => {
  const name = String(req.body?.name || '').trim()
  if (!name) return bad(res, 'Client name is required.')
  const list = clients()
  if (list.some((c) => c.name.toLowerCase() === name.toLowerCase())) return bad(res, 'That client already exists.')
  const c = { id: randomUUID(), name, website: String(req.body.website || '').trim(), niche: String(req.body.niche || '').trim(), notes: String(req.body.notes || ''), createdAt: now() }
  list.push(c); store.write('clients', list)
  ok(res, { client: c })
})

app.patch('/api/clients/:id', (req, res) => {
  const list = clients()
  const c = list.find((x) => x.id === req.params.id)
  if (!c) return bad(res, 'Client not found.', 404)
  for (const k of ['name', 'website', 'niche', 'notes']) if (k in req.body) c[k] = String(req.body[k] ?? '').trim()
  store.write('clients', list)
  ok(res, { client: c })
})

app.delete('/api/clients/:id', async (req, res) => {
  store.write('clients', clients().filter((x) => x.id !== req.params.id))
  await removeOrderFiles(orders().filter((o) => o.clientId === req.params.id).map((o) => o.id))
  store.write('orders', orders().filter((o) => o.clientId !== req.params.id))
  ok(res, {})
})

/* ── orders (pipeline) ──────────────────────────────────────────────── */

// Fields added after the first release; older orders (and bundle-created
// ones) get them filled in on read so the UI never sees undefined.
const ORDER_DEFAULTS = {
  articleTitle: '', targetKeywords: [], contentBy: 'client', wordCount: null, files: [],
  clientPrice: null, deadlineAt: null, publisherPaidAt: null, clientPaidAt: null,
}
const CONTENT_BY = ['client', 'us', 'publisher']

/** What still has to be in place before the article can go to the publisher. */
function readiness(o) {
  const items = [
    ['Article title / topic', !!o.articleTitle],
    ['Article (Google Doc or file)', !!(o.draftUrl || o.files?.length || o.contentBy === 'publisher')],
    ['Target URL', !!o.targetUrl],
    ['Anchor text', !!o.anchorText],
    ['Target keywords', !!o.targetKeywords?.length],
  ]
  return { done: items.filter(([, v]) => v).length, total: items.length, missing: items.filter(([, v]) => !v).map(([k]) => k) }
}

const hctx = () => ({ sites: new Map(sites().map((x) => [x.id, x])), clients: new Map(clients().map((x) => [x.id, x])) })
// Callers doing .map(hydrate) pass an index as the 2nd argument, hence the check.
const hydrate = (o, ctx) => {
  const c0 = ctx && ctx.sites ? ctx : hctx()
  const s = c0.sites.get(o.siteId)
  const c = c0.clients.get(o.clientId)
  const full = { ...ORDER_DEFAULTS, ...o }
  return {
    ...full,
    readiness: readiness(full),
    margin: full.clientPrice != null && full.priceAgreed != null ? full.clientPrice - full.priceAgreed : null,
    site: s ? { id: s.id, name: s.name, url: s.url, da: s.da, dr: s.dr, traffic: s.traffic, priceGuestPost: s.priceGuestPost, priceLinkInsert: s.priceLinkInsert, niches: s.niches, tat: s.tat, linkType: s.linkType, sampleLink: s.sampleLink, contactEmail: s.contactEmail || '', guidelines: s.guidelines || '' } : null,
    client: c ? { id: c.id, name: c.name, website: c.website } : null,
  }
}

app.get('/api/orders', (req, res) => {
  let list = orders()
  if (req.query.clientId) list = list.filter((o) => o.clientId === req.query.clientId)
  if (req.query.status) list = list.filter((o) => o.status === req.query.status)
  if (req.query.siteId) list = list.filter((o) => o.siteId === req.query.siteId)
  list.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
  const ctx = hctx()
  ok(res, { orders: list.map((o) => hydrate(o, ctx)), stages: STAGES })
})

app.post('/api/orders', (req, res) => {
  const { siteId, clientId, status = 'Prospecting' } = req.body || {}
  if (!sites().some((s) => s.id === siteId)) return bad(res, 'Site not found.')
  if (!clients().some((c) => c.id === clientId)) return bad(res, 'Client not found.')
  if (!STAGES.includes(status)) return bad(res, 'Unknown stage.')
  const list = orders()
  if (list.some((o) => o.siteId === siteId && o.clientId === clientId && !['Live', 'Rejected'].includes(o.status))) {
    return bad(res, 'That site is already in the pipeline for this client.')
  }
  const o = {
    id: randomUUID(), siteId, clientId, status,
    priceAgreed: num(req.body.priceAgreed), type: req.body.type === 'link_insert' ? 'link_insert' : 'guest_post',
    targetUrl: '', anchorText: '', draftUrl: '', publishedUrl: '', notes: String(req.body.notes || ''),
    ...ORDER_DEFAULTS, clientPrice: num(req.body.clientPrice),
    lastContactedAt: null, followUpAt: null, publishedAt: null,
    history: [{ at: now(), status }],
    createdAt: now(), updatedAt: now(),
  }
  list.push(o); store.write('orders', list)
  ok(res, { order: hydrate(o) })
})

app.patch('/api/orders/:id', (req, res) => {
  const list = orders()
  const o = list.find((x) => x.id === req.params.id)
  if (!o) return bad(res, 'Order not found.', 404)
  const b = req.body || {}
  const before = { publishedUrl: o.publishedUrl, targetUrl: o.targetUrl, anchorText: o.anchorText }
  if ('status' in b && b.status !== o.status) {
    if (!STAGES.includes(b.status)) return bad(res, 'Unknown stage.')
    o.status = b.status
    o.history.push({ at: now(), status: b.status })
    if (b.status === 'Contacted') o.lastContactedAt = o.lastContactedAt || now()
    if (['Published', 'Live'].includes(b.status)) o.publishedAt = o.publishedAt || now()
  }
  for (const k of ['targetUrl', 'anchorText', 'draftUrl', 'publishedUrl', 'notes', 'type']) if (k in b) o[k] = String(b[k] ?? '')
  for (const k of ['lastContactedAt', 'followUpAt', 'publishedAt', 'deadlineAt', 'publisherPaidAt', 'clientPaidAt']) if (k in b) o[k] = b[k] || null
  if ('priceAgreed' in b) o.priceAgreed = num(b.priceAgreed)
  if ('clientPrice' in b) o.clientPrice = num(b.clientPrice)
  if ('wordCount' in b) o.wordCount = num(b.wordCount)
  if ('articleTitle' in b) o.articleTitle = String(b.articleTitle ?? '').slice(0, 200)
  if ('contentBy' in b && CONTENT_BY.includes(b.contentBy)) o.contentBy = b.contentBy
  if ('targetKeywords' in b) {
    const raw = Array.isArray(b.targetKeywords) ? b.targetKeywords : String(b.targetKeywords ?? '').split(/[,\n]/)
    o.targetKeywords = [...new Set(raw.map((k) => String(k).trim()).filter(Boolean).map((k) => k.slice(0, 80)))].slice(0, 15)
  }
  const recheck = ['publishedUrl', 'targetUrl', 'anchorText'].some((k) => k in b && String(b[k] ?? '') !== String(before[k] ?? '')) && o.publishedUrl
  o.updatedAt = now()
  store.write('orders', list)
  ok(res, { order: hydrate(o), recheck: !!recheck })
})

app.delete('/api/orders/:id', async (req, res) => {
  await removeOrderFiles([req.params.id])
  store.write('orders', orders().filter((x) => x.id !== req.params.id))
  ok(res, {})
})

// Article files live in .data/uploads/<orderId>/, next to the JSON store,
// so a backup of .data is a backup of everything.
const UPLOADS = path.join(DATA_DIR, 'uploads')
const FILE_TYPES = ['.docx', '.doc', '.pdf', '.odt', '.rtf', '.txt', '.md', '.html', '.png', '.jpg', '.jpeg', '.webp', '.zip']
const safeName = (n) => path.basename(String(n || 'file')).replace(/[^\w.\- ()]+/g, '_').replace(/^\.+/, '').slice(0, 120) || 'file'
const orderDir = (id) => path.join(UPLOADS, String(id).replace(/[^\w-]/g, ''))
async function removeOrderFiles(ids) {
  const urls = orders().filter((o) => ids.includes(o.id)).flatMap((o) => (o.files || []).map((f) => f.url).filter(Boolean))
  if (urls.length && BLOB) { const { del } = await import('@vercel/blob'); await del(urls).catch(() => {}) }
  if (store.mode === 'file') for (const id of ids) fs.rmSync(orderDir(id), { recursive: true, force: true })
}
const MAX_FILE = 15 * 1024 * 1024
const uniqueName = (name, files) => {
  const ext = path.extname(name), base = name.slice(0, -ext.length || undefined)
  let n = name
  for (let i = 2; files.some((f) => f.name === n); i++) n = `${base} (${i})${ext}`
  return n
}

// Hosted: the browser uploads straight to Vercel Blob with a short-lived token
// (Vercel caps request bodies at 4.5 MB), then registers the file here.
app.post('/api/orders/:id/upload-token', async (req, res) => {
  if (!BLOB) return bad(res, 'This install stores files locally.')
  const o = orders().find((x) => x.id === req.params.id)
  if (!o) return bad(res, 'Order not found.', 404)
  const name = safeName(req.body?.name)
  if (!FILE_TYPES.includes(path.extname(name).toLowerCase())) return bad(res, `File type not allowed. Use ${FILE_TYPES.join(' ')}`)
  if (Number(req.body?.size) > MAX_FILE) return bad(res, 'Files can be up to 15 MB.')
  const { generateClientTokenFromReadWriteToken } = await import('@vercel/blob/client')
  const pathname = `orders/${o.id}/${name}`
  const clientToken = await generateClientTokenFromReadWriteToken({ pathname, maximumSizeInBytes: MAX_FILE, addRandomSuffix: true, validUntil: Date.now() + 10 * 60e3 })
  ok(res, { clientToken, pathname })
})
app.post('/api/orders/:id/files/register', (req, res) => {
  const list = orders()
  const o = list.find((x) => x.id === req.params.id)
  if (!o) return bad(res, 'Order not found.', 404)
  const url = String(req.body?.url || '')
  // Only accept files that landed in this order's folder of a Blob store.
  if (!new RegExp(`^https://[a-z0-9]+\\.(public|private)\\.blob\\.vercel-storage\\.com/orders/${o.id}/`, 'i').test(url)) return bad(res, 'Unexpected file location.')
  const name = uniqueName(safeName(req.body?.name), o.files || [])
  o.files = [...(o.files || []), { name, size: Number(req.body?.size) || 0, uploadedAt: now(), url }]
  o.updatedAt = now()
  store.write('orders', list)
  ok(res, { order: hydrate(o) })
})

app.post('/api/orders/:id/files', express.raw({ type: () => true, limit: '15mb' }), (req, res) => {
  if (store.mode !== 'file') return bad(res, 'Use the upload token route on hosted installs.')
  const list = orders()
  const o = list.find((x) => x.id === req.params.id)
  if (!o) return bad(res, 'Order not found.', 404)
  let name = safeName(decodeURIComponent(String(req.get('x-filename') || '')))
  const ext = path.extname(name).toLowerCase()
  if (!FILE_TYPES.includes(ext)) return bad(res, `File type ${ext || '(none)'} not allowed. Use ${FILE_TYPES.join(' ')}`)
  if (!req.body?.length) return bad(res, 'Empty file.')
  const dir = orderDir(o.id)
  fs.mkdirSync(dir, { recursive: true })
  // Same name uploaded again = a new version, kept alongside: "article (2).docx".
  const base = name.slice(0, -ext.length)
  for (let i = 2; fs.existsSync(path.join(dir, name)); i++) name = `${base} (${i})${ext}`
  fs.writeFileSync(path.join(dir, name), req.body)
  o.files = [...(o.files || []), { name, size: req.body.length, uploadedAt: now() }]
  o.updatedAt = now()
  store.write('orders', list)
  ok(res, { order: hydrate(o) })
})

app.get('/api/orders/:id/files/:name', (req, res) => {
  const f = (orders().find((x) => x.id === req.params.id)?.files || []).find((x) => x.name === req.params.name)
  if (f?.url) return res.redirect(f.url)
  const file = path.join(orderDir(req.params.id), safeName(req.params.name))
  if (!fs.existsSync(file)) return bad(res, 'File not found.', 404)
  res.download(file)
})

app.delete('/api/orders/:id/files/:name', async (req, res) => {
  const list = orders()
  const o = list.find((x) => x.id === req.params.id)
  if (!o) return bad(res, 'Order not found.', 404)
  const name = safeName(req.params.name)
  const f = (o.files || []).find((x) => x.name === name)
  if (f?.url && BLOB) { const { del } = await import('@vercel/blob'); await del(f.url).catch(() => {}) }
  else fs.rmSync(path.join(orderDir(o.id), name), { force: true })
  o.files = (o.files || []).filter((f) => f.name !== name)
  o.updatedAt = now()
  store.write('orders', list)
  ok(res, { order: hydrate(o) })
})

/* ── dashboard ──────────────────────────────────────────────────────── */

app.get('/api/stats', (req, res) => {
  const ss = sites(), os = orders(), cs = clients()
  const byStage = Object.fromEntries(STAGES.map((s) => [s, 0]))
  for (const o of os) byStage[o.status] = (byStage[o.status] || 0) + 1
  const spend = os.filter((o) => ['Accepted', 'Published', 'Live'].includes(o.status)).reduce((a, o) => a + (o.priceAgreed ?? 0), 0)
  const today = now().slice(0, 10)
  const ctx = hctx()
  const followUps = os.filter((o) => o.followUpAt && o.followUpAt.slice(0, 10) <= today && !['Live', 'Rejected'].includes(o.status)).map((o) => hydrate(o, ctx))
  const committed = os.filter((o) => ['Accepted', 'Published', 'Live'].includes(o.status))
  const revenue = committed.reduce((a, o) => a + (o.clientPrice ?? 0), 0)
  const inThreeDays = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10)
  const deadlines = os.filter((o) => o.deadlineAt && o.deadlineAt.slice(0, 10) <= inThreeDays && !['Published', 'Live', 'Rejected'].includes(o.status))
    .sort((a, b) => a.deadlineAt.localeCompare(b.deadlineAt)).map((o) => hydrate(o, ctx))
  const unpaidPublishers = os.filter((o) => ['Published', 'Live'].includes(o.status) && !o.publisherPaidAt).length
  const niches = {}
  for (const s of ss) for (const n of s.niches) niches[n] = (niches[n] || 0) + 1
  const drs = ss.map((s) => s.dr).filter((x) => x !== null)
  ok(res, {
    sites: ss.length, clients: cs.length, orders: os.length,
    byStage, spend, revenue, margin: revenue - committed.filter((o) => o.clientPrice != null).reduce((a, o) => a + (o.priceAgreed ?? 0), 0), followUps, deadlines, unpaidPublishers,
    niches: Object.entries(niches).sort((a, b) => b[1] - a[1]),
    avgDr: drs.length ? Math.round(drs.reduce((a, b) => a + b, 0) / drs.length) : 0,
    lastImport: meta().imports[0] || null,
    linkAlerts: os.filter((o) => ['lost', 'page_down', 'changed'].includes(o.linkCheck?.verdict)).map((o) => hydrate(o, ctx)),
    linksTracked: os.filter((o) => o.publishedUrl).length,
    openRequests: store.read('requests', []).filter((r) => r.status === 'new').length,
  })
})

app.get('/api/report/:clientId', (req, res) => {
  const c = clients().find((x) => x.id === req.params.clientId)
  if (!c) return bad(res, 'Client not found.', 404)
  const ctx = hctx()
  const list = orders().filter((o) => o.clientId === c.id).map((o) => hydrate(o, ctx))
  ok(res, { client: c, orders: list, stages: STAGES })
})

/* ── bundles ────────────────────────────────────────────────────────── */

const bundles = () => store.read('bundles', [])

// Bundle criteria → the same query shape the Sites filter understands.
const criteriaQuery = (c = {}) => ({
  niche: c.niche || '', minDr: c.minDr ?? '', maxDr: c.maxDr ?? '', minDa: c.minDa ?? '', minTraffic: c.minTraffic ?? '',
  maxPrice: c.maxPrice ?? '', maxTat: c.maxTat ?? '', follow: c.follow || '', country: c.country || '',
  flagged: c.excludeFlagged === false ? '' : 'hide', live: c.liveOnly ? 'yes' : '',
})
// High DR with almost no traffic is the classic inflated-metrics site: cheap
// "for its DR" but worth little to a client. Value ranking pushes those down.
const trafficPenalty = (t) => (t == null ? 1.5 : t < 1000 ? 4 : t < 10000 ? 1.8 : 1)
const valueScore = (s) => (s.valueRatio ?? 3) * trafficPenalty(s.traffic)
const STRATEGY_SORT = {
  value: (a, b) => valueScore(a) - valueScore(b) || (b.dr ?? 0) - (a.dr ?? 0),
  cheapest: (a, b) => a.priceGuestPost - b.priceGuestPost || (b.dr ?? 0) - (a.dr ?? 0),
  dr: (a, b) => (b.dr ?? 0) - (a.dr ?? 0) || a.priceGuestPost - b.priceGuestPost,
  traffic: (a, b) => (b.traffic ?? 0) - (a.traffic ?? 0) || a.priceGuestPost - b.priceGuestPost,
}
const bundleSite = (s) => ({
  id: s.id, name: s.name, url: s.url, dr: s.dr, da: s.da, traffic: s.traffic, priceGuestPost: s.priceGuestPost,
  follow: s.follow, maxLinks: s.maxLinks, linkType: s.linkType, tatDays: s.tatDays, niches: s.niches, country: s.country,
  valueRatio: s.valueRatio, live: s.live, flags: s.flags,
})
function bundleTotals(list) {
  const avg = (f) => { const v = list.map(f).filter((x) => x != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null }
  const tats = list.map((s) => s.tatDays).filter((x) => x != null).sort((a, b) => a - b)
  const withFollow = list.filter((s) => s.follow)
  return {
    cost: list.reduce((a, s) => a + (s.priceGuestPost || 0), 0),
    avgDr: avg((s) => s.dr), avgDa: avg((s) => s.da),
    traffic: list.reduce((a, s) => a + (s.traffic || 0), 0),
    dofollowPct: withFollow.length ? Math.round((withFollow.filter((s) => s.follow === 'dofollow').length / withFollow.length) * 100) : 0,
    medianTat: tats.length ? tats[Math.floor(tats.length / 2)] : null,
  }
}

/** Locked sites first (in the order given), then the best candidates by
 *  strategy until `count` is reached. Down/parked sites never qualify. */
app.post('/api/bundles/preview', (req, res) => {
  const { criteria = {}, count = 10, strategy = 'value', lock = [], exclude = [] } = req.body || {}
  const all = withDerived()
  const byId = new Map(all.map((s) => [s.id, s]))
  const pool = filterSites(all, criteriaQuery(criteria)).filter((s) => s.priceGuestPost > 0 && s.live !== false)
  const n = Math.max(1, Math.min(100, Number(count) || 10))
  const skip = new Set([...lock, ...exclude])
  const locked = lock.map((id) => byId.get(id)).filter(Boolean).slice(0, n)
  const fill = pool.filter((s) => !skip.has(s.id)).sort(STRATEGY_SORT[strategy] || STRATEGY_SORT.value)
  const picked = [...locked, ...fill.slice(0, n - locked.length)]
  ok(res, { picked: picked.map(bundleSite), alternates: fill.slice(n - locked.length, n - locked.length + 10).map(bundleSite), pool: pool.length, totals: bundleTotals(picked) })
})

function hydrateBundle(b) {
  const all = new Map(withDerived().map((s) => [s.id, s]))
  const list = b.siteIds.map((id) => all.get(id)).filter(Boolean)
  const t = bundleTotals(list)
  const writing = (b.writingCost || 0) * list.length
  return { ...b, sites: list.map(bundleSite), totals: { ...t, missing: b.siteIds.length - list.length, margin: (b.sellPrice || 0) - t.cost - writing } }
}
const cleanBundle = (body) => ({
  name: String(body.name || 'Bundle').trim().slice(0, 80), criteria: body.criteria || {}, strategy: String(body.strategy || 'value'),
  siteIds: Array.isArray(body.siteIds) ? body.siteIds.map(String) : [], sellPrice: num(body.sellPrice) ?? 0,
  writingCost: num(body.writingCost) ?? 0, markup: num(body.markup) ?? 2,
})

app.get('/api/bundles', (req, res) => ok(res, { bundles: bundles().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).map(hydrateBundle) }))
app.post('/api/bundles', (req, res) => {
  const b = { id: randomUUID(), ...cleanBundle(req.body || {}), assignments: [], createdAt: now(), updatedAt: now() }
  if (!b.siteIds.length) return bad(res, 'A bundle needs at least one site.')
  const list = bundles(); list.push(b); store.write('bundles', list)
  ok(res, { bundle: hydrateBundle(b) })
})
app.patch('/api/bundles/:id', (req, res) => {
  const list = bundles()
  const b = list.find((x) => x.id === req.params.id)
  if (!b) return bad(res, 'Bundle not found.', 404)
  Object.assign(b, cleanBundle({ ...b, ...req.body }), { updatedAt: now() })
  store.write('bundles', list)
  ok(res, { bundle: hydrateBundle(b) })
})
app.delete('/api/bundles/:id', (req, res) => { store.write('bundles', bundles().filter((x) => x.id !== req.params.id)); ok(res, {}) })

// Sell a bundle: one pipeline entry per site for the client, priced at the
// site's cost, skipping any site already in progress for that client.
app.post('/api/bundles/:id/assign', (req, res) => {
  const list = bundles()
  const b = list.find((x) => x.id === req.params.id)
  if (!b) return bad(res, 'Bundle not found.', 404)
  const c = clients().find((x) => x.id === req.body?.clientId)
  if (!c) return bad(res, 'Client not found.')
  const ss = new Map(sites().map((s) => [s.id, s]))
  const os = orders()
  let created = 0, skipped = 0
  for (const siteId of b.siteIds) {
    const s = ss.get(siteId)
    if (!s || os.some((o) => o.siteId === siteId && o.clientId === c.id && !['Live', 'Rejected'].includes(o.status))) { skipped++; continue }
    os.push({
      id: randomUUID(), siteId, clientId: c.id, status: 'Prospecting', priceAgreed: s.priceGuestPost ?? null, type: 'guest_post',
      targetUrl: '', anchorText: '', draftUrl: '', publishedUrl: '', notes: `Bundle: ${b.name}`, bundleId: b.id,
      lastContactedAt: null, followUpAt: null, publishedAt: null, history: [{ at: now(), status: 'Prospecting' }], createdAt: now(), updatedAt: now(),
    })
    created++
  }
  store.write('orders', os)
  b.assignments = [...(b.assignments || []), { clientId: c.id, clientName: c.name, at: now(), created }]
  store.write('bundles', list)
  ok(res, { created, skipped })
})

/* ── live-link monitor ──────────────────────────────────────────────── */

// Every published placement is checked when saved (the page asks for it) and
// then every LINK_RECHECK_DAYS days (default 30) by the daily cron.
const RECHECK_DAYS = Number(process.env.LINK_RECHECK_DAYS || 30)

async function checkOrders(ids) {
  const cs = new Map(clients().map((c) => [c.id, c]))
  const targets = orders().filter((o) => ids.includes(o.id) && o.publishedUrl)
  let i = 0
  const results = new Map()
  await Promise.all(Array.from({ length: LINK_BATCH }, async () => {
    while (i < targets.length) {
      const o = targets[i++]
      let r
      try { r = await checkLink({ ...o, clientWebsite: cs.get(o.clientId)?.website }, { timeoutMs: 15000 }) } catch (e) { r = { checkedAt: now(), verdict: 'unverified', note: String(e.message || e).slice(0, 80) } }
      results.set(o.id, r)
    }
  }))
  // Merge into a fresh, locked read so edits made during the check are kept.
  await store.update('orders', (list) => {
  for (const o of list) {
    const r = results.get(o.id)
    if (!r) continue
    const prev = o.linkCheck
    o.linkCheck = r
    o.linkHistory = [...(o.linkHistory || []), { at: r.checkedAt, verdict: r.verdict, follow: r.follow }].slice(-24)
    // First bad result after a good one: note when the link was lost.
    if (['lost', 'page_down'].includes(r.verdict) && !['lost', 'page_down'].includes(prev?.verdict)) o.linkLostAt = r.checkedAt
    if (r.verdict === 'ok') o.linkLostAt = null
  }
  return list
  })
  return results
}

const dueForCheck = () => {
  const cutoff = Date.now() - RECHECK_DAYS * 864e5
  return orders().filter((o) => o.publishedUrl && (!o.linkCheck || Date.parse(o.linkCheck.checkedAt) < cutoff)).map((o) => o.id)
}
const VERDICT_ORDER = ['lost', 'page_down', 'changed', 'unverified', 'ok', 'pending']
app.get('/api/links', (req, res) => {
  const ctx = hctx()
  const list = orders().filter((o) => o.publishedUrl || ['Published', 'Live'].includes(o.status)).map((o) => ({ ...hydrate(o, ctx), verdict: !o.publishedUrl ? 'no_url' : o.linkCheck?.verdict || 'pending' }))
  const summary = Object.fromEntries([...VERDICT_ORDER, 'no_url'].map((v) => [v, list.filter((o) => o.verdict === v).length]))
  list.sort((a, b) => VERDICT_ORDER.indexOf(a.verdict) - VERDICT_ORDER.indexOf(b.verdict))
  ok(res, { links: list, summary, recheckDays: RECHECK_DAYS, due: dueForCheck().length, batch: LINK_BATCH })
})
// body: { orderIds?: [...] } — none = everything with a published URL.
// Checks one batch and returns the ids still to do; the page loops.
app.post('/api/links/check', async (req, res) => {
  const ids = Array.isArray(req.body?.orderIds) && req.body.orderIds.length ? req.body.orderIds : orders().filter((o) => o.publishedUrl).map((o) => o.id)
  if (!ids.length) return bad(res, 'No placements have a published URL yet.')
  const results = await checkOrders(ids.slice(0, LINK_BATCH))
  ok(res, { checked: results.size, remaining: ids.slice(LINK_BATCH) })
})

/* ── client catalog ─────────────────────────────────────────────────── */

const catalogs = () => store.read('catalogs', [])
const mergeCatalog = (base, body = {}) => ({
  ...base,
  name: String(body.name ?? base.name).trim().slice(0, 100) || 'Catalog',
  clientId: String(body.clientId ?? base.clientId ?? ''),
  intro: String(body.intro ?? base.intro ?? '').slice(0, 800),
  contactEmail: String(body.contactEmail ?? base.contactEmail ?? '').trim().slice(0, 120),
  criteria: { ...base.criteria, ...(body.criteria || {}) },
  pricing: { ...base.pricing, ...(body.pricing || {}) },
  display: { ...base.display, ...(body.display || {}) },
})

/** Sites a catalog offers: its criteria, priced sites only, never down or parked. */
function catalogSites(cat) {
  const c = cat.criteria || {}
  const q = { niche: c.niche || '', minDr: c.minDr ?? '', maxDr: c.maxDr ?? '', minTraffic: c.minTraffic ?? '', maxPrice: c.maxCost ?? '', follow: c.follow || '', flagged: c.excludeFlagged === false ? '' : 'hide', live: c.liveOnly ? 'yes' : '' }
  return filterSites(withDerived(), q).filter((s) => s.priceGuestPost > 0 && s.live !== false).sort((a, b) => (b.dr ?? 0) - (a.dr ?? 0))
}

app.get('/api/catalogs', (req, res) => ok(res, { catalogs: catalogs().map((c) => ({ ...c, count: catalogSites(c).length })), defaults: DEFAULT_CATALOG }))
app.post('/api/catalogs', (req, res) => {
  const c = { id: randomUUID(), ...mergeCatalog(DEFAULT_CATALOG, req.body), createdAt: now(), updatedAt: now() }
  const list = catalogs(); list.push(c); store.write('catalogs', list)
  ok(res, { catalog: c })
})
app.patch('/api/catalogs/:id', (req, res) => {
  const list = catalogs()
  const i = list.findIndex((x) => x.id === req.params.id)
  if (i < 0) return bad(res, 'Catalog not found.', 404)
  list[i] = { ...mergeCatalog(list[i], req.body), updatedAt: now() }
  store.write('catalogs', list)
  ok(res, { catalog: list[i] })
})
app.delete('/api/catalogs/:id', (req, res) => { store.write('catalogs', catalogs().filter((x) => x.id !== req.params.id)); ok(res, {}) })

// Preview works on unsaved settings too (body = the catalog being edited).
// `internal` is for your eyes in the app only; the export never includes it.
app.post('/api/catalogs/preview', (req, res) => {
  const cat = mergeCatalog(DEFAULT_CATALOG, req.body)
  const list = catalogSites(cat)
  const rows = list.map((s) => ({ ...clientRow(s, cat), internal: { siteId: s.id, name: s.name, url: s.url, cost: s.priceGuestPost } }))
  const priced = rows.filter((r) => r.price != null)
  const cost = priced.reduce((a, r) => a + r.internal.cost, 0), sell = priced.reduce((a, r) => a + r.price, 0)
  ok(res, { rows, totals: { count: rows.length, avgMarginPct: sell ? Math.round(((sell - cost) / sell) * 100) : 0, medianPrice: priced.length ? priced.map((r) => r.price).sort((a, b) => a - b)[Math.floor(priced.length / 2)] : null } })
})

app.get('/api/catalogs/:id/export', (req, res) => {
  const cat = catalogs().find((x) => x.id === req.params.id)
  if (!cat) return bad(res, 'Catalog not found.', 404)
  const rows = catalogSites(cat).map((s) => clientRow(s, cat))
  const file = `${cat.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'catalog'}.html`
  res.set('Content-Type', 'text/html; charset=utf-8')
  if (!req.query.view) res.set('Content-Disposition', `attachment; filename="${file}"`)
  res.send(renderCatalogHtml(cat, rows))
})

// A client's reply → sites. Accepts any text: pulls every GP-XXXXXX code out
// of it (the emailed request, a pasted list, a forwarded message).
app.post('/api/catalogs/resolve', (req, res) => {
  const codes = [...new Set((String(req.body?.text || '').toUpperCase().match(/GP-[0-9A-F]{6}/g) || []))]
  const cat = catalogs().find((x) => x.id === req.body?.catalogId)
  const pricing = cat?.pricing || DEFAULT_CATALOG.pricing
  const byCode = new Map(withDerived().map((s) => [refCode(s.id), s]))
  const found = [], missing = []
  for (const code of codes) {
    const s = byCode.get(code)
    if (!s) { missing.push(code); continue }
    found.push({ code, siteId: s.id, name: s.name, url: s.url, dr: s.dr, cost: s.priceGuestPost, price: sellPrice(s.priceGuestPost, pricing), live: s.live, flags: s.flags })
  }
  ok(res, { found, missing })
})

// Several placements at once for one client, each with cost + client price.
app.post('/api/orders/bulk', (req, res) => {
  const { clientId, items = [], note = '' } = req.body || {}
  const c = clients().find((x) => x.id === clientId)
  if (!c) return bad(res, 'Client not found.')
  const ss = new Map(sites().map((s) => [s.id, s]))
  const os = orders()
  let created = 0, skipped = 0
  for (const it of items) {
    const s = ss.get(it.siteId)
    if (!s || os.some((o) => o.siteId === s.id && o.clientId === c.id && !['Live', 'Rejected'].includes(o.status))) { skipped++; continue }
    os.push({
      id: randomUUID(), siteId: s.id, clientId: c.id, status: 'Prospecting', type: 'guest_post',
      priceAgreed: num(it.priceAgreed) ?? s.priceGuestPost ?? null, targetUrl: '', anchorText: '', draftUrl: '', publishedUrl: '',
      notes: String(note || ''), ...ORDER_DEFAULTS, clientPrice: num(it.clientPrice),
      lastContactedAt: null, followUpAt: null, publishedAt: null, history: [{ at: now(), status: 'Prospecting' }], createdAt: now(), updatedAt: now(),
    })
    created++
  }
  store.write('orders', os)
  ok(res, { created, skipped })
})

/* ── content planner ────────────────────────────────────────────────── */

// Articles planned for clients, before and after they become placements.
// A content item can be linked to one pipeline order; while linked, its
// title / keywords / target / anchor / doc / due date are pushed onto the
// order so the two never disagree.
const CONTENT_STAGES = ['Idea', 'Brief', 'Writing', 'Review', 'Approved', 'Placed', 'Published']
const INTENTS = ['informational', 'commercial', 'comparison', 'local', 'news']
const content = () => store.read('content', [])

const cleanContent = (b = {}, base = {}) => {
  const list = (v) => (Array.isArray(v) ? v : String(v ?? '').split(/[,\n]/)).map((x) => String(x).trim()).filter(Boolean)
  const out = { ...base }
  for (const k of ['title', 'targetKeyword', 'targetUrl', 'anchorText', 'draftUrl', 'brief', 'writer', 'niche']) if (k in b) out[k] = String(b[k] ?? '').slice(0, k === 'brief' ? 4000 : 300)
  if ('secondaryKeywords' in b) out.secondaryKeywords = [...new Set(list(b.secondaryKeywords))].slice(0, 15)
  if ('status' in b && CONTENT_STAGES.includes(b.status)) out.status = b.status
  if ('intent' in b && (INTENTS.includes(b.intent) || b.intent === '')) out.intent = b.intent
  if ('wordCount' in b) out.wordCount = num(b.wordCount)
  if ('dueAt' in b) out.dueAt = b.dueAt || null
  if ('clientId' in b) out.clientId = String(b.clientId || '')
  return out
}
const CONTENT_BLANK = { title: '', targetKeyword: '', secondaryKeywords: [], targetUrl: '', anchorText: '', draftUrl: '', brief: '', writer: '', niche: '', intent: 'informational', wordCount: null, dueAt: null, status: 'Idea', orderId: null }

/** Push the article fields onto the linked order (never the other way). */
function syncToOrder(item, os) {
  const o = item.orderId && os.find((x) => x.id === item.orderId)
  if (!o) return false
  o.articleTitle = item.title
  o.targetKeywords = [item.targetKeyword, ...(item.secondaryKeywords || [])].filter(Boolean)
  o.targetUrl = item.targetUrl
  o.anchorText = item.anchorText
  if (item.draftUrl) o.draftUrl = item.draftUrl
  if (item.wordCount != null) o.wordCount = item.wordCount
  if (item.dueAt) o.deadlineAt = item.dueAt
  o.updatedAt = now()
  return true
}

function hydrateContent(item, ctx, os) {
  const o = item.orderId ? os.find((x) => x.id === item.orderId) : null
  const s = o ? ctx.sites.get(o.siteId) : null
  const c = ctx.clients.get(item.clientId)
  // A published order moves its article to Published automatically.
  const status = o && ['Published', 'Live'].includes(o.status) ? 'Published' : item.status
  return {
    ...CONTENT_BLANK, ...item, status,
    client: c ? { id: c.id, name: c.name, website: c.website } : null,
    order: o ? { id: o.id, status: o.status, publishedUrl: o.publishedUrl, linkVerdict: o.linkCheck?.verdict || null, site: s ? { id: s.id, name: s.name, url: s.url, dr: s.dr } : null } : null,
  }
}

app.get('/api/content', (req, res) => {
  const ctx = hctx(), os = orders()
  let list = content()
  if (req.query.clientId) list = list.filter((x) => x.clientId === req.query.clientId)
  list.sort((a, b) => (a.dueAt || '9999').localeCompare(b.dueAt || '9999') || (b.updatedAt || '').localeCompare(a.updatedAt || ''))
  ok(res, { items: list.map((x) => hydrateContent(x, ctx, os)), stages: CONTENT_STAGES, intents: INTENTS })
})

app.post('/api/content', (req, res) => {
  const b = req.body || {}
  // Bulk: { clientId, lines: "title | keyword | target url" per line }
  const rows = typeof b.lines === 'string'
    ? b.lines.split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((p) => p[0]).map(([title, targetKeyword = '', targetUrl = '']) => ({ title, targetKeyword, targetUrl }))
    : [b]
  if (!clients().some((c) => c.id === b.clientId)) return bad(res, 'Pick a client.')
  const list = content()
  const made = rows.map((r) => ({ id: randomUUID(), ...CONTENT_BLANK, ...cleanContent({ ...r, clientId: b.clientId, status: b.status }), createdAt: now(), updatedAt: now() }))
  if (!made.length || made.some((m) => !m.title)) return bad(res, 'Each idea needs a title.')
  list.push(...made); store.write('content', list)
  ok(res, { created: made.length, item: made[0] })
})

app.patch('/api/content/:id', (req, res) => {
  const list = content()
  const i = list.findIndex((x) => x.id === req.params.id)
  if (i < 0) return bad(res, 'Content not found.', 404)
  list[i] = { ...cleanContent(req.body, list[i]), updatedAt: now() }
  const os = orders()
  if (syncToOrder(list[i], os)) store.write('orders', os)
  store.write('content', list)
  ok(res, { item: hydrateContent(list[i], hctx(), os) })
})

app.delete('/api/content/:id', (req, res) => { store.write('content', content().filter((x) => x.id !== req.params.id)); ok(res, {}) })

// Link to an existing open order ({ orderId }) or create one on a site ({ siteId }).
app.post('/api/content/:id/assign', (req, res) => {
  const list = content()
  const item = list.find((x) => x.id === req.params.id)
  if (!item) return bad(res, 'Content not found.', 404)
  const os = orders()
  let o
  if (req.body?.orderId) {
    o = os.find((x) => x.id === req.body.orderId && x.clientId === item.clientId)
    if (!o) return bad(res, 'That order is not for this client.')
    const taken = list.find((x) => x.orderId === o.id && x.id !== item.id)
    if (taken) return bad(res, `That placement already carries "${taken.title}".`)
  } else if (req.body?.siteId) {
    const s = sites().find((x) => x.id === req.body.siteId)
    if (!s) return bad(res, 'Site not found.')
    if (os.some((x) => x.siteId === s.id && x.clientId === item.clientId && !['Live', 'Rejected'].includes(x.status))) return bad(res, `${s.name} is already in progress for this client. Link that order instead.`)
    o = {
      id: randomUUID(), siteId: s.id, clientId: item.clientId, status: 'Prospecting', type: 'guest_post', priceAgreed: s.priceGuestPost ?? null,
      targetUrl: '', anchorText: '', draftUrl: '', publishedUrl: '', notes: 'From content planner', ...ORDER_DEFAULTS,
      lastContactedAt: null, followUpAt: null, publishedAt: null, history: [{ at: now(), status: 'Prospecting' }], createdAt: now(), updatedAt: now(),
    }
    os.push(o)
  } else return bad(res, 'Send orderId or siteId.')
  item.orderId = o.id
  if (CONTENT_STAGES.indexOf(item.status) < CONTENT_STAGES.indexOf('Placed')) item.status = 'Placed'
  item.updatedAt = now()
  syncToOrder(item, os)
  store.write('orders', os); store.write('content', list)
  ok(res, { item: hydrateContent(item, hctx(), os) })
})

app.post('/api/content/:id/unassign', (req, res) => {
  const list = content()
  const item = list.find((x) => x.id === req.params.id)
  if (!item) return bad(res, 'Content not found.', 404)
  item.orderId = null
  if (item.status === 'Placed') item.status = 'Approved'
  item.updatedAt = now()
  store.write('content', list)
  ok(res, { item: hydrateContent(item, hctx(), orders()) })
})

// Sites that fit this article: its niche, strong enough, priced, live, not
// already used for this client (a second post on the same publisher is
// worth far less than a new referring domain).
app.get('/api/content/:id/suggest', (req, res) => {
  const item = content().find((x) => x.id === req.params.id)
  if (!item) return bad(res, 'Content not found.', 404)
  const used = new Set(orders().filter((o) => o.clientId === item.clientId && o.status !== 'Rejected').map((o) => o.siteId))
  const q = { niche: req.query.niche ?? item.niche ?? '', minDr: req.query.minDr ?? 30, follow: 'dofollow', flagged: 'hide', maxPrice: req.query.maxPrice ?? '' }
  const pool = filterSites(withDerived(), q).filter((s) => s.priceGuestPost > 0 && s.live !== false && !used.has(s.id) && (s.traffic ?? 0) >= 1000)
  pool.sort((a, b) => valueScore(a) - valueScore(b))
  ok(res, { sites: pool.slice(0, 12).map(bundleSite), pool: pool.length, excludedUsed: used.size })
})

/* Anchor mix — the share of each anchor type across a client's placements
 * (planned and live). Heavy exact-match anchors are the classic
 * over-optimisation pattern; a natural profile is mostly branded, URL and
 * generic anchors. */
const GENERIC = /^(click here|here|this (post|article|guide|site|page|link)|learn more|read more|more info(rmation)?|website|this website|visit( site| website)?|source|link|find out more|check (it|this) out|see more)$/i
function classifyAnchor(anchor, { keyword = '', brand = '', domain = '' } = {}) {
  const a = String(anchor || '').trim().toLowerCase()
  if (!a) return 'missing'
  const d = String(domain || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')
  if (/^(https?:\/\/|www\.)/.test(a) || (d && (a === d || a === `www.${d}` || a.startsWith(`${d}/`)))) return 'url'
  if (GENERIC.test(a)) return 'generic'
  const k = String(keyword || '').trim().toLowerCase()
  // Exact before branded: for an exact-match domain (dhalicense.com) the
  // keyword *is* the brand root, and calling it branded would hide the very
  // over-optimisation this report exists to catch.
  if (k && a === k) return 'exact'
  const squash = (x) => x.replace(/[\s\-_]+/g, '')
  const b = String(brand || '').trim().toLowerCase()
  const root = d.split('.')[0]
  const rootIsKeyword = root && k && squash(k).includes(root)
  if ((b && squash(a).includes(squash(b))) || (d && a.includes(d)) || (root.length > 3 && !rootIsKeyword && squash(a).includes(root))) return 'branded'
  const kw = k.split(/\s+/).filter((w) => w.length > 2)
  if (kw.length && kw.filter((w) => a.includes(w)).length >= Math.ceil(kw.length / 2)) return 'partial'
  return 'other'
}

app.get('/api/content/insights', (req, res) => {
  const c = clients().find((x) => x.id === req.query.clientId)
  if (!c) return bad(res, 'Pick a client.')
  const items = content().filter((x) => x.clientId === c.id)
  const os = orders().filter((o) => o.clientId === c.id && o.status !== 'Rejected')
  const linked = new Set(items.map((x) => x.orderId).filter(Boolean))
  // One entry per planned or placed link: content items, plus orders that
  // were set up directly in the pipeline without a content item.
  const links = [
    ...items.map((x) => {
      const o = x.orderId && os.find((y) => y.id === x.orderId)
      return { anchor: x.anchorText, keyword: x.targetKeyword, target: x.targetUrl, source: 'plan', live: !!o && ['Published', 'Live'].includes(o.status) }
    }),
    ...os.filter((o) => !linked.has(o.id)).map((o) => ({ anchor: o.anchorText, keyword: o.targetKeywords?.[0] || '', target: o.targetUrl, source: 'order', live: ['Published', 'Live'].includes(o.status) })),
  ]
  const mix = {}
  for (const l of links) { const t = classifyAnchor(l.anchor, { keyword: l.keyword, brand: c.name, domain: c.website }); mix[t] = (mix[t] || 0) + 1; l.type = t }
  const withAnchor = links.filter((l) => l.type !== 'missing').length
  const exactPct = withAnchor ? Math.round(((mix.exact || 0) / withAnchor) * 100) : 0
  const warnings = []
  if (withAnchor >= 4 && exactPct > 30) warnings.push(`${exactPct}% of anchors are exact-match keywords. Keep exact match under about 20–30% and move the rest to branded, URL and partial anchors.`)
  if (withAnchor >= 4 && !(mix.branded || mix.url)) warnings.push('No branded or URL anchors yet. A natural link profile is led by the brand name and plain URLs.')
  const anchorCounts = {}
  for (const l of links) if (l.anchor) anchorCounts[l.anchor.toLowerCase()] = (anchorCounts[l.anchor.toLowerCase()] || 0) + 1
  const repeated = Object.entries(anchorCounts).filter(([, n]) => n >= 3).map(([a, n]) => ({ anchor: a, count: n }))
  for (const r of repeated) warnings.push(`"${r.anchor}" is used ${r.count} times. Vary the wording.`)
  // Target pages: which client URLs get links, and how many are live.
  const byTarget = {}
  for (const l of links) {
    const t = l.target || '(no target set)'
    byTarget[t] = byTarget[t] || { target: t, planned: 0, live: 0, keywords: new Set() }
    byTarget[t][l.live ? 'live' : 'planned']++
    if (l.keyword) byTarget[t].keywords.add(l.keyword)
  }
  const targets = Object.values(byTarget).map((t) => ({ ...t, keywords: [...t.keywords] })).sort((a, b) => b.live + b.planned - (a.live + a.planned))
  const byStatus = Object.fromEntries(CONTENT_STAGES.map((s) => [s, 0]))
  const ctx = hctx(), all = orders()
  for (const it of items) byStatus[hydrateContent(it, ctx, all).status]++
  ok(res, { client: { id: c.id, name: c.name, website: c.website }, total: links.length, withAnchor, mix, exactPct, warnings, targets, links, byStatus })
})

/* ── client portal ──────────────────────────────────────────────────── */

// Everything a client account can see. Built from the same client-safe rows
// as the exported catalog: codes, never domains, never your costs.
const requests = () => store.read('requests', [])
const visibleCatalogs = (req) => catalogs().filter((c) => !c.clientId || c.clientId === req.user.clientId)
const CLIENT_STAGE = { Prospecting: 'Booked', Contacted: 'Booked', Replied: 'Booked', Negotiating: 'Booked', 'Content Sent': 'With publisher', Accepted: 'With publisher', Published: 'Published', Live: 'Published', Rejected: 'Being replaced' }

function portalOrder(o, ctx) {
  const s = ctx.sites.get(o.siteId)
  const published = ['Published', 'Live'].includes(o.status)
  return {
    id: o.id, stage: CLIENT_STAGE[o.status] || 'Booked', articleTitle: o.articleTitle || '', targetUrl: o.targetUrl || '', anchorText: o.anchorText || '',
    price: o.clientPrice ?? null, deadlineAt: o.deadlineAt || null, createdAt: o.createdAt,
    // The publisher is revealed once the article is live (the URL shows it anyway).
    publisher: s ? (published ? s.url : maskDomain(s.url, 'hidden')) : null, dr: s?.dr ?? null,
    publishedAt: published ? o.publishedAt : null, publishedUrl: published ? o.publishedUrl || '' : '',
    link: published && o.publishedUrl ? o.linkCheck?.verdict || 'pending' : null, linkCheckedAt: published ? o.linkCheck?.checkedAt || null : null,
  }
}

app.get('/api/portal/catalogs', (req, res) => {
  ok(res, { catalogs: visibleCatalogs(req).map((c) => ({ id: c.id, name: c.name, intro: c.intro, showDa: c.display?.showDa !== false, rows: catalogSites(c).map((s) => clientRow(s, c)).filter((r) => r.price != null) })) })
})
app.get('/api/portal/orders', (req, res) => {
  const ctx = hctx()
  const list = orders().filter((o) => o.clientId === req.user.clientId).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
  ok(res, { orders: list.map((o) => portalOrder(o, ctx)) })
})
app.get('/api/portal/requests', (req, res) => {
  ok(res, { requests: requests().filter((r) => r.clientId === req.user.clientId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) })
})
app.post('/api/portal/requests', (req, res) => {
  const cat = visibleCatalogs(req).find((c) => c.id === req.body?.catalogId)
  if (!cat) return bad(res, 'Catalog not found.')
  const rows = new Map(catalogSites(cat).map((s) => clientRow(s, cat)).filter((r) => r.price != null).map((r) => [r.code, r]))
  const codes = [...new Set((req.body?.codes || []).map((c) => String(c).toUpperCase()))].slice(0, 100)
  const items = codes.map((c) => rows.get(c)).filter(Boolean).map((r) => ({ code: r.code, price: r.price, niche: r.niches[0] || '', dr: r.dr }))
  if (!items.length) return bad(res, 'Pick at least one publisher.')
  const r = {
    id: randomUUID(), clientId: req.user.clientId, userId: req.user.id, catalogId: cat.id, catalogName: cat.name,
    items, total: items.reduce((a, i) => a + i.price, 0), note: String(req.body?.note || '').slice(0, 2000), status: 'new', createdAt: now(),
  }
  const list = requests(); list.push(r); store.write('requests', list)
  ok(res, { request: r })
})

/* ── requests inbox (admin) ─────────────────────────────────────────── */

app.get('/api/requests', (req, res) => {
  const cs = new Map(clients().map((c) => [c.id, c.name]))
  const byCode = new Map(withDerived().map((s) => [refCode(s.id), s]))
  const list = requests().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((r) => ({
    ...r, clientName: cs.get(r.clientId) || '(deleted client)',
    // Your view: which real site each code is, and what it costs you now.
    items: r.items.map((i) => { const s = byCode.get(i.code); return { ...i, siteId: s?.id || null, name: s?.name || null, url: s?.url || null, cost: s?.priceGuestPost ?? null, live: s?.live ?? null } }),
  }))
  ok(res, { requests: list, open: list.filter((r) => r.status === 'new').length })
})
// Turn a request into pipeline orders at the prices the client was quoted.
app.post('/api/requests/:id/convert', (req, res) => {
  const list = requests()
  const r = list.find((x) => x.id === req.params.id)
  if (!r) return bad(res, 'Request not found.', 404)
  if (r.status === 'converted') return bad(res, 'Already converted.')
  const byCode = new Map(withDerived().map((s) => [refCode(s.id), s]))
  const os = orders()
  let created = 0, skipped = 0
  for (const i of r.items) {
    const s = byCode.get(i.code)
    if (!s || os.some((o) => o.siteId === s.id && o.clientId === r.clientId && !['Live', 'Rejected'].includes(o.status))) { skipped++; continue }
    os.push({
      id: randomUUID(), siteId: s.id, clientId: r.clientId, status: 'Prospecting', type: 'guest_post', priceAgreed: s.priceGuestPost ?? null,
      targetUrl: '', anchorText: '', draftUrl: '', publishedUrl: '', notes: `Client request ${r.id.slice(0, 8)}${r.note ? `: ${r.note.slice(0, 200)}` : ''}`,
      ...ORDER_DEFAULTS, clientPrice: i.price, requestId: r.id,
      lastContactedAt: null, followUpAt: null, publishedAt: null, history: [{ at: now(), status: 'Prospecting' }], createdAt: now(), updatedAt: now(),
    })
    created++
  }
  r.status = 'converted'; r.convertedAt = now(); r.created = created
  store.write('orders', os); store.write('requests', list)
  ok(res, { created, skipped })
})
app.patch('/api/requests/:id', (req, res) => {
  const list = requests()
  const r = list.find((x) => x.id === req.params.id)
  if (!r) return bad(res, 'Request not found.', 404)
  if (['new', 'declined'].includes(req.body?.status)) r.status = req.body.status
  if ('reply' in (req.body || {})) r.reply = String(req.body.reply || '').slice(0, 2000)
  r.updatedAt = now()
  store.write('requests', list)
  ok(res, { request: r })
})

/* ── backup, restore, sheet sync (admin) ────────────────────────────── */

// Logins and secrets are never included: a backup file can be shared safely
// with a developer, and restoring can't lock anyone out.
const BACKUP_COLLECTIONS = ['sites', 'orders', 'clients', 'meta', 'bundles', 'catalogs', 'content', 'requests']
app.get('/api/backup', (req, res) => {
  const data = { app: 'guest-post-pro', version: 1, exportedAt: now(), collections: Object.fromEntries(BACKUP_COLLECTIONS.map((n) => [n, store.read(n, n === 'meta' ? { imports: [] } : [])])) }
  res.setHeader('Content-Disposition', `attachment; filename="guest-post-pro-backup-${now().slice(0, 10)}.json"`)
  res.json(data)
})
app.post('/api/backup', (req, res) => {
  const c = req.body?.collections
  if (req.body?.app !== 'guest-post-pro' || !c || typeof c !== 'object') return bad(res, 'That is not a Contextual Domain backup file.')
  const restored = []
  for (const n of BACKUP_COLLECTIONS) if (n in c) { store.write(n, c[n]); restored.push(`${n} (${Array.isArray(c[n]) ? c[n].length : 'object'})`) }
  ok(res, { restored })
})

// The vendor sheet, pulled server-side (the old `npm run sync`, as a button).
app.post('/api/sync-sheet', async (req, res) => {
  const tabs = (await fetchTabs()).filter((t) => !SKIP_TABS.has(t.name.toLowerCase()))
  tabs.sort((a, b) => Number(a.name === '2026') - Number(b.name === '2026')) // 2026 last: its values win
  const grids = new Map()
  for (let i = 0; i < tabs.length; i += 6) {
    const chunk = tabs.slice(i, i + 6)
    const got = await Promise.all(chunk.map((t) => fetchTabGrid(t.gid).catch(() => null)))
    chunk.forEach((t, j) => grids.set(t.name, got[j]))
  }
  const report = []
  const total = { added: 0, updated: 0, skipped: 0 }
  for (const t of tabs) {
    const grid = grids.get(t.name)
    if (!grid) { report.push({ tab: t.name, error: 'could not download' }); continue }
    const niche = NICHE_FOR[t.name.toLowerCase()] ?? t.name
    const { rows } = tabToRows(grid, niche)
    if (!rows.length) { report.push({ tab: t.name, rows: 0 }); continue }
    const r = importRows(rows, { source: `sheet:${t.name}`, defaultNiche: niche })
    total.added += r.added; total.updated += r.updated; total.skipped += r.skipped
    report.push({ tab: t.name, rows: rows.length, ...r })
  }
  ok(res, { total, tabs: report })
})
const NICHE_FOR = { '2026': 'Top Publications', 'all niches': '' }
const SKIP_TABS = new Set((process.env.GP_SKIP_TABS ?? 'rough,Ai test').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))

/* ── scheduled work ─────────────────────────────────────────────────── */

// Called once a day by Vercel Cron (and every 6 h by the local server). Sized
// to finish inside one serverless call: a few due links, one batch of sites.
export async function runDaily() {
  const cutoff = Date.now() - RECHECK_DAYS * 864e5
  const due = orders().filter((o) => o.publishedUrl && (!o.linkCheck || Date.parse(o.linkCheck.checkedAt) < cutoff)).map((o) => o.id)
  const links = due.length ? await checkOrders(due.slice(0, LINK_BATCH)) : new Map()
  const sitesRes = await enrichBatch(Date.now() - 30 * 864e5, SITE_BATCH)
  return { links: { checked: links.size, stillDue: Math.max(0, due.length - links.size) }, sites: sitesRes, at: now() }
}
app.get('/api/cron/daily', async (req, res) => {
  const secret = process.env.CRON_SECRET
  const allowed = secret ? safeEq(req.get('authorization') || '', `Bearer ${secret}`) : ON_VERCEL && /vercel-cron/i.test(req.get('user-agent') || '')
  if (!allowed) return bad(res, 'Not allowed.', 401)
  ok(res, await runDaily())
})

/* ── static (production build, local only; Vercel serves dist itself) ── */

const DIST = path.join(ROOT, 'dist')
if (!ON_VERCEL && fs.existsSync(DIST)) {
  app.use(express.static(DIST))
  app.get('*', (req, res) => res.sendFile(path.join(DIST, 'index.html')))
}

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err)
  if (!res.headersSent) res.status(500).json({ ok: false, error: err.message || 'Server error' })
})

export default app

function num(v) {
  if (v === undefined || v === null || v === '') return null
  // "10K" / "1.5M" as typed in the traffic filter.
  const m = String(v).trim().match(/^\$?([\d.,]+)\s*([km])$/i)
  if (m) return Number(m[1].replace(/,/g, '')) * (m[2].toLowerCase() === 'k' ? 1e3 : 1e6)
  const n = Number(String(v).replace(/[$,]/g, ''))
  return Number.isFinite(n) ? n : null
}
