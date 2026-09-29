// End-to-end test of the hosted setup (Postgres + logins + portal) on this PC,
// using PGlite (real Postgres compiled to WASM, in memory). Nothing touches
// .data or the network database.  Run: node server/test-hosted.mjs

import fs from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'

const pg = new PGlite()
globalThis.__GP_TEST_DB = {
  query: (s, p) => pg.query(s, p),
  tx: (fn) => pg.transaction((tx) => fn((s, p) => tx.query(s, p))),
}
process.env.SETUP_CODE = 'test-setup-code-123'
process.env.CRON_SECRET = 'test-cron-secret'

const { default: app, store } = await import('./app.js')
const server = app.listen(8791)
const BASE = 'http://127.0.0.1:8791'
let pass = 0, fail = 0
const check = (label, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  · ' + extra : ''}`) }

function session() {
  let cookie = ''
  return async (method, url, body, headers = {}) => {
    const r = await fetch(BASE + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers }, body: body && JSON.stringify(body), redirect: 'manual' })
    const sc = r.headers.get('set-cookie')
    if (sc) cookie = sc.split(';')[0]
    const text = await r.text()
    let json; try { json = JSON.parse(text) } catch { json = { raw: text } }
    return { status: r.status, ...json }
  }
}

try {
  check('store is postgres', store.mode === 'postgres')
  const admin = session(), anon = session()

  let me = await anon('GET', '/api/auth/me')
  check('auth on + needs setup', me.authEnabled && me.needsSetup && me.setupEnabled)
  check('api blocked before login', (await anon('GET', '/api/sites')).status === 401)
  check('setup rejects wrong code', (await anon('POST', '/api/auth/setup', { email: 'x@y.com', password: 'longpassword1', code: 'nope' })).status === 403)
  check('setup rejects short password', (await anon('POST', '/api/auth/setup', { email: 'x@y.com', password: 'short', code: process.env.SETUP_CODE })).status === 400)
  const setup = await admin('POST', '/api/auth/setup', { email: 'Khalid@Example.com', name: 'Khalid', password: 'a-long-admin-password', code: process.env.SETUP_CODE })
  check('setup creates admin + logs in', setup.ok && setup.user.role === 'admin' && setup.user.email === 'khalid@example.com')
  check('second setup refused', (await anon('POST', '/api/auth/setup', { email: 'z@y.com', password: 'longpassword1', code: process.env.SETUP_CODE })).status === 409)

  // Move the real local data in via the backup endpoint (same as going live).
  const dir = path.resolve('.data')
  const collections = {}
  for (const n of ['sites', 'orders', 'clients', 'meta', 'bundles', 'catalogs', 'content']) { try { collections[n] = JSON.parse(fs.readFileSync(path.join(dir, `${n}.json`), 'utf8')) } catch {} }
  const size = JSON.stringify({ app: 'guest-post-pro', collections }).length
  const restored = await admin('POST', '/api/backup', { app: 'guest-post-pro', version: 1, collections })
  check('restore backup', restored.ok, `${(size / 1024 / 1024).toFixed(2)} MB, ${restored.restored?.join(', ')}`)
  check('restore payload under Vercel 4.5 MB limit', size < 4.5 * 1024 * 1024)

  let t = Date.now()
  const s1 = await admin('GET', '/api/sites?sort=dr')
  const ms1 = Date.now() - t; t = Date.now()
  const s2 = await admin('GET', '/api/sites?sort=dr')
  check('sites load from postgres', s1.sites?.length === collections.sites.length, `${s1.sites?.length} sites · first ${ms1} ms, cached ${Date.now() - t} ms`)

  // Client account + portal
  const cl = await admin('POST', '/api/clients', { name: 'Portal Test Clinic', website: 'portaltest.ae' })
  const cu = await admin('POST', '/api/users', { email: 'client@clinic.ae', name: 'Dr Test', role: 'client', clientId: cl.client.id })
  check('client login created with temp password', cu.ok && /^[\w]{4}-[\w]{4}-[\w]{4}-[\w]{4}$/.test(cu.tempPassword))
  // A catalog visible to everyone
  const cat = await admin('POST', '/api/catalogs', { name: 'Portal Catalog', criteria: { minDr: 40, follow: 'dofollow' } })
  const client = session()
  const login = await client('POST', '/api/auth/login', { email: 'CLIENT@clinic.ae', password: cu.tempPassword })
  check('client logs in (email case-insensitive)', login.ok && login.user.mustChangePassword)
  check('must change password before portal', (await client('GET', '/api/portal/catalogs')).status === 403)
  check('client password change', (await client('POST', '/api/auth/password', { current: cu.tempPassword, next: 'client-new-password' })).ok)
  const pc = await client('GET', '/api/portal/catalogs')
  const pjson = JSON.stringify(pc).toLowerCase()
  const leaked = collections.sites.filter((s) => s.url.length > 5 && pjson.includes(s.url.toLowerCase()))
  check('portal catalog loads', pc.catalogs?.length === 1 && pc.catalogs[0].rows.length > 0, `${pc.catalogs?.[0]?.rows.length} rows`)
  check('portal catalog leaks no domains', leaked.length === 0, leaked.slice(0, 3).map((s) => s.url).join(','))
  {
    // Only "shown to clients" sites may reach the portal.
    const { refCode } = await import('./lib/catalog.js')
    const { derive } = await import('./lib/derive.js')
    const byCode = new Map(collections.sites.map((s) => [refCode(s.id), s]))
    const notActive = pc.catalogs[0].rows.filter((r) => derive(byCode.get(r.code)).listing !== 'active')
    check('portal shows only live, unflagged sites', notActive.length === 0, `${notActive.length} pending sites leaked`)
  }
  check('portal rows have no cost fields', !/priceguestpost|"cost"|"internal"|contactemail/.test(pjson))
  check('client blocked from admin API', (await client('GET', '/api/sites')).status === 403 && (await client('GET', '/api/users')).status === 403 && (await client('GET', '/api/backup')).status === 403)

  const codes = pc.catalogs[0].rows.slice(0, 3).map((r) => r.code)
  const rq = await client('POST', '/api/portal/requests', { catalogId: cat.catalog.id, codes: [...codes, 'GP-000000'], note: 'For our DHA pages' })
  check('client submits request (bogus code dropped)', rq.ok && rq.request.items.length === 3, `total $${rq.request?.total}`)
  const inbox = await admin('GET', '/api/requests')
  check('admin inbox shows real sites + costs', inbox.open === 1 && inbox.requests[0].items.every((i) => i.url && i.cost != null))
  check('codes use the CD- prefix', rq.request.items.every((i) => i.code.startsWith('CD-')))
  // Conversation: admin asks, client sees a badge, client answers, admin sees it
  const m1 = await admin('POST', `/api/requests/${rq.request.id}/messages`, { text: 'Which page should the links point to?' })
  let cr = await client('GET', '/api/portal/requests')
  check('client sees admin reply + unread badge', m1.ok && cr.unread === 1 && cr.requests[0].thread.map((m) => m.from).join(',') === 'client,admin', cr.requests[0]?.thread.map((m) => m.text).join(' | '))
  await client('POST', `/api/portal/requests/${rq.request.id}/read`)
  cr = await client('GET', '/api/portal/requests')
  check('opening marks it read', cr.unread === 0)
  const m2 = await client('POST', `/api/portal/requests/${rq.request.id}/messages`, { text: 'Our DHA licence page, please.' })
  const inbox2 = await admin('GET', '/api/requests')
  check('client reply shows in admin inbox', m2.ok && inbox2.requests[0].adminUnread === true && inbox2.requests[0].thread.length === 3)
  check("logged-out visitors can't post on a request", (await anon('POST', `/api/portal/requests/${rq.request.id}/messages`, { text: 'x' })).status === 401)
  // Old GP- codes still resolve to the same site
  const oldCode = rq.request.items[0].code.replace(/^CD-/, 'GP-')
  const res2 = await admin('POST', '/api/catalogs/resolve', { text: `please book ${oldCode}` })
  check('old GP- codes still resolve', res2.found.length === 1 && res2.found[0].code === rq.request.items[0].code)
  const conv = await admin('POST', `/api/requests/${rq.request.id}/convert`, { message: 'Booked, articles next week.' })
  check('convert request → orders', conv.created === 3)
  cr = await client('GET', '/api/portal/requests')
  check('acceptance message reaches the client', cr.requests[0].status === 'converted' && cr.requests[0].thread.at(-1).text === 'Booked, articles next week.' && cr.unread === 1)
  const po = await client('GET', '/api/portal/orders')
  const pojson = JSON.stringify(po).toLowerCase()
  check('client sees 3 orders, publisher masked, no cost', po.orders.length === 3 && po.orders.every((o) => o.publisher.startsWith('Publisher')) && !/priceagreed|"margin"/.test(pojson), po.orders.map((o) => `${o.stage} $${o.price}`).join(', '))

  // Publish one order → portal reveals it + link check batch
  const { orders } = await admin('GET', `/api/orders?clientId=${cl.client.id}`)
  const up = await admin('PATCH', `/api/orders/${orders[0].id}`, { status: 'Published', publishedUrl: 'https://example.com/', targetUrl: 'https://iana.org/help/example-domains', anchorText: 'Learn more' })
  check('order PATCH asks the page to recheck', up.recheck === true)
  const lc = await admin('POST', '/api/links/check', { orderIds: [orders[0].id] })
  check('link check batch', lc.checked === 1 && lc.remaining.length === 0)
  const po2 = await client('GET', '/api/portal/orders')
  const pub = po2.orders.find((o) => o.id === orders[0].id)
  check('published order visible to client with link status', pub.stage === 'Published' && pub.link === 'ok' && !pub.publisher.startsWith('Publisher'), `${pub.publisher} · ${pub.link}`)

  // Site-check batch must not clobber an edit made while it runs
  const target = s1.sites.find((s) => !s.checkedAt) || s1.sites[5]
  const batchP = admin('POST', '/api/enrich/batch', { before: new Date().toISOString(), size: 10 })
  await new Promise((r) => setTimeout(r, 300))
  const edit = await admin('PATCH', `/api/sites/${target.id}`, { notes: 'edited during batch' })
  const batch = await batchP
  const after = (await admin('GET', `/api/sites?q=${encodeURIComponent(target.url)}`)).sites.find((s) => s.id === target.id)
  check('enrich batch runs', batch.checked > 0, `checked ${batch.checked}, remaining ${batch.remaining}`)
  check('edit during batch survives', edit.ok && after.notes === 'edited during batch')

  // Cron
  check('cron refuses without secret', (await anon('GET', '/api/cron/daily')).status === 401)
  t = Date.now()
  const cron = await anon('GET', '/api/cron/daily', undefined, { authorization: `Bearer ${process.env.CRON_SECRET}` })
  check('cron runs with secret', cron.ok, `${JSON.stringify(cron.links)} sites ${cron.sites?.checked} in ${((Date.now() - t) / 1000).toFixed(1)} s`)

  // Lockout
  const bad = session()
  let last
  for (let i = 0; i < 9; i++) last = await bad('POST', '/api/auth/login', { email: 'client@clinic.ae', password: 'wrong' + i })
  check('lockout after 8 wrong passwords', last.status === 429)
  check('unknown email gives same message', (await bad('POST', '/api/auth/login', { email: 'nobody@x.com', password: 'whatever12' })).error === 'Email or password is wrong.')

  // Backup never contains logins or secrets
  const bk = await admin('GET', '/api/backup')
  check('backup excludes users + secrets', !('users' in bk.collections) && !('secrets' in bk.collections) && !JSON.stringify(bk).includes('scrypt$'))

  // Logout
  await client('POST', '/api/auth/logout')
  check('logout ends the session', (await client('GET', '/api/portal/orders')).status === 401)
} catch (e) {
  fail++; console.error('ERROR', e)
} finally {
  console.log(`\n${pass} passed, ${fail} failed`)
  server.close(); process.exit(fail ? 1 : 0)
}
