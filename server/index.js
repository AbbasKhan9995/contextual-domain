// Guest Post Pro — local server. Runs the same Express app that Vercel runs
// (server/app.js), on this PC, with file storage in .data/ and no logins
// unless GP_AUTH=1 or a DATABASE_URL is set.

import app, { store, runDaily, DATA_DIR } from './app.js'

const PRODUCTION = process.env.NODE_ENV === 'production'
const PORT = Number(PRODUCTION ? process.env.PORT || 8080 : process.env.GP_API_PORT || 8789)
const HOST = process.env.GP_HOST || '127.0.0.1'

app.listen(PORT, HOST, () => console.log(`Guest Post Pro API on http://${HOST}:${PORT}  storage: ${store.mode === 'file' ? DATA_DIR : 'postgres'}`))

// The daily work Vercel Cron does when hosted: due link checks + one batch of
// stale sites. Here it runs a minute after start and every 6 hours. Only in
// file mode: in postgres mode reads need a request (use the cron URL).
if (store.mode === 'file') {
  const tick = () => runDaily().then((r) => { if (r.links.checked || r.sites.checked) console.log('[daily]', JSON.stringify(r)) }).catch((e) => console.error('[daily]', e.message))
  setTimeout(tick, 60_000).unref?.()
  setInterval(tick, 6 * 3600_000).unref?.()
}
