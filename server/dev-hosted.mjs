// Preview the hosted setup on this PC: Postgres (PGlite, in memory), logins
// on, the built UI served on http://127.0.0.1:8792. Seeds a copy of .data so
// there is something to look at. Nothing is written to .data.
//
//   npm run build && node server/dev-hosted.mjs
//   (setup code: dev-setup-code, or set SETUP_CODE)

import fs from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'

const pg = new PGlite()
globalThis.__GP_TEST_DB = { query: (s, p) => pg.query(s, p), tx: (fn) => pg.transaction((tx) => fn((s, p) => tx.query(s, p))) }
process.env.SETUP_CODE ||= 'dev-setup-code'

const { default: app } = await import('./app.js')

// Load the local data straight into the database table.
await pg.query(`CREATE TABLE IF NOT EXISTS gp_collections (name text PRIMARY KEY, data jsonb NOT NULL, version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now())`)
for (const n of ['sites', 'orders', 'clients', 'meta', 'bundles', 'catalogs', 'content']) {
  const f = path.resolve('.data', `${n}.json`)
  if (fs.existsSync(f)) await pg.query('INSERT INTO gp_collections (name, data) VALUES ($1, $2::jsonb) ON CONFLICT (name) DO NOTHING', [n, fs.readFileSync(f, 'utf8')])
}

app.listen(8792, '127.0.0.1', () => console.log('Hosted preview on http://127.0.0.1:8792'))
