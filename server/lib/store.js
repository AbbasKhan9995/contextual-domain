// Persistence, two backends behind one interface:
//
//   file      JSON files in .data/ (local use, the original setup)
//   postgres  one row per collection in `gp_collections` (hosted on Vercel)
//
// Route handlers stay synchronous: `store.read()` / `store.write()`. In
// Postgres mode a middleware loads the collections before the handler runs
// (per request, via AsyncLocalStorage, so concurrent requests never share
// objects) and saves every written collection before the response goes out.
// Long jobs that must not clobber a user's edit use `store.update()`, a
// locked read-modify-write.

import fs from 'node:fs'
import path from 'node:path'
import { AsyncLocalStorage } from 'node:async_hooks'

export const COLLECTIONS = ['sites', 'orders', 'clients', 'meta', 'bundles', 'catalogs', 'content', 'users', 'requests', 'secrets']
const clone = (v) => (v === undefined ? v : structuredClone(v))

/* ── file backend ───────────────────────────────────────────────────── */

export function makeFileStore(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true })
  const file = (name) => path.join(dataDir, `${name}.json`)
  const read = (name, fallback = []) => {
    try { return JSON.parse(fs.readFileSync(file(name), 'utf8')) } catch { return fallback }
  }
  const write = (name, value) => {
    // Temp file + rename, so a crash mid-write can't truncate a collection.
    const tmp = file(name) + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2))
    fs.renameSync(tmp, file(name))
    return value
  }
  return {
    mode: 'file',
    read, write,
    async update(name, fn, fallback = []) { return write(name, fn(read(name, fallback))) },
    exists: (name) => fs.existsSync(file(name)),
    middleware: (req, res, next) => next(),
    async init() {},
  }
}

/* ── postgres backend ───────────────────────────────────────────────── */

/** `db` = { query(sql, params) → {rows}, tx(fn(query) → result) }. */
export function makePgStore(db) {
  const als = new AsyncLocalStorage()
  const cache = new Map() // name → { version, data } for this warm instance
  let ready = null

  const init = () => (ready ??= db.query(`CREATE TABLE IF NOT EXISTS gp_collections (
      name text PRIMARY KEY, data jsonb NOT NULL, version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now())`))

  // One cheap query for versions; only collections that changed elsewhere are re-downloaded.
  async function refresh() {
    await init()
    const { rows } = await db.query('SELECT name, version FROM gp_collections')
    const stale = rows.filter((r) => cache.get(r.name)?.version !== r.version).map((r) => r.name)
    if (stale.length) {
      const got = await db.query('SELECT name, data, version FROM gp_collections WHERE name = ANY($1)', [stale])
      for (const r of got.rows) cache.set(r.name, { version: r.version, data: r.data })
    }
    const present = new Set(rows.map((r) => r.name))
    for (const k of [...cache.keys()]) if (!present.has(k)) cache.delete(k)
  }

  async function save(name, value) {
    const { rows } = await db.query(`INSERT INTO gp_collections (name, data) VALUES ($1, $2::jsonb)
      ON CONFLICT (name) DO UPDATE SET data = EXCLUDED.data, version = gp_collections.version + 1, updated_at = now()
      RETURNING version`, [name, JSON.stringify(value)])
    cache.set(name, { version: rows[0].version, data: value })
  }

  const ctx = () => {
    const c = als.getStore()
    if (!c) throw new Error('store.read/write outside a request in postgres mode: use await store.update()')
    return c
  }

  return {
    mode: 'postgres',
    init,
    read(name, fallback = []) {
      const c = ctx()
      if (!c.snap.has(name)) c.snap.set(name, cache.has(name) ? clone(cache.get(name).data) : clone(fallback))
      return c.snap.get(name)
    },
    write(name, value) {
      const c = ctx()
      c.snap.set(name, value)
      c.dirty.add(name)
      return value
    },
    exists: (name) => cache.has(name),
    /** Locked read-modify-write straight against the database. */
    async update(name, fn, fallback = []) {
      await init()
      const next = await db.tx(async (q) => {
        const { rows } = await q('SELECT data FROM gp_collections WHERE name = $1 FOR UPDATE', [name])
        const value = fn(rows.length ? rows[0].data : clone(fallback))
        const r = await q(`INSERT INTO gp_collections (name, data) VALUES ($1, $2::jsonb)
          ON CONFLICT (name) DO UPDATE SET data = EXCLUDED.data, version = gp_collections.version + 1, updated_at = now()
          RETURNING version`, [name, JSON.stringify(value)])
        cache.set(name, { version: r.rows[0].version, data: value })
        return value
      })
      const c = als.getStore()
      if (c) { c.snap.set(name, clone(next)); c.dirty.delete(name) }
      return next
    },
    middleware(req, res, next) {
      refresh().then(() => {
        const c = { snap: new Map(), dirty: new Set() }
        als.run(c, () => {
          // Save before the response leaves: on serverless the instance may
          // be frozen the moment the reply is sent.
          const send = res.send.bind(res)
          let saving = false
          res.send = function (body) {
            if (saving || !c.dirty.size) return send(body)
            saving = true
            Promise.all([...c.dirty].map((n) => save(n, c.snap.get(n))))
              .then(() => send(body))
              .catch((e) => { res.status(500).type('json'); send(JSON.stringify({ ok: false, error: `Could not save: ${e.message}` })) })
            return res
          }
          next()
        })
      }).catch((e) => res.status(503).json({ ok: false, error: `Database unavailable: ${e.message}` }))
    },
  }
}

/** node-postgres adapter (Neon / any Postgres URL). */
export async function pgAdapter(url) {
  const { default: pg } = await import('pg')
  const local = /localhost|127\.0\.0\.1/.test(url)
  const pool = new pg.Pool({ connectionString: url, max: 3, ssl: local ? false : { rejectUnauthorized: false } })
  return {
    query: (s, p) => pool.query(s, p),
    async tx(fn) {
      const c = await pool.connect()
      try {
        await c.query('BEGIN')
        const r = await fn((s, p) => c.query(s, p))
        await c.query('COMMIT')
        return r
      } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e } finally { c.release() }
    },
  }
}

/** Picks the backend from the environment. */
export async function createStore({ dataDir, databaseUrl, db } = {}) {
  if (db) return makePgStore(db) // tests (PGlite)
  if (databaseUrl) return makePgStore(await pgAdapter(databaseUrl))
  return makeFileStore(dataDir)
}

// Back-compat for code written before the Postgres backend.
export const makeStore = makeFileStore
