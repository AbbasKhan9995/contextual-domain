// Run the site check from the terminal (the Data health panel does the same).
//
//   npm run enrich               check every site not checked yet
//   npm run enrich -- --stale    also re-check sites checked 30+ days ago
//   npm run enrich -- --all      re-check everything
//
// Talks to the running app: GP_API (default http://127.0.0.1:8789). For the
// hosted app set GP_API=https://your-app.vercel.app and ADMIN_API_TOKEN.

const API = process.env.GP_API || 'http://127.0.0.1:8789'
const headers = { 'content-type': 'application/json', ...(process.env.ADMIN_API_TOKEN ? { authorization: `Bearer ${process.env.ADMIN_API_TOKEN}` } : {}) }
const before = process.argv.includes('--all') ? new Date().toISOString() : process.argv.includes('--stale') ? new Date(Date.now() - 30 * 864e5).toISOString() : '1970-01-01'

const call = async (method, path, body) => {
  const res = await fetch(`${API}${path}`, { method, headers, body: body && JSON.stringify(body) })
  const data = await res.json()
  if (!data.ok) throw new Error(data.error)
  return data
}

let done = 0, total = null
const n = { live: 0, down: 0, unknown: 0 }
while (true) {
  const r = await call('POST', '/api/enrich/batch', { before })
  total ??= r.checked + r.remaining
  done += r.checked; n.live += r.live; n.down += r.down; n.unknown += r.unknown
  process.stdout.write(`\r${done}/${total}  live ${n.live} · down ${n.down} · unverified ${n.unknown}   `)
  if (!r.remaining || !r.checked) break
}
const { coverage } = await call('GET', '/api/enrich')
console.log('\n\nData coverage now:')
for (const [k, v] of Object.entries(coverage.fields)) console.log(`  ${k.padEnd(18)} ${String(v.pct).padStart(3)}%  (${v.n})`)
console.log(`  Flagged sites      ${coverage.flagged}`)
