// Sync the vendor sheet into the running API.
//
//   npm run sync          import every tab
//   npm run sync:dry      show what each tab would produce, post nothing
//   node server/sync-sheet.js --dry --debug --tab=SAAS --tab=CRYPTO
//                         per-column header / fill / type votes for those tabs
//
// Env: GP_API (default http://127.0.0.1:8789), GP_SHEET_ID, GP_SKIP_TABS
// (comma list, default "rough,Ai test" — the hidden scratch tabs).

import { fetchTabs, fetchTabGrid, tabToRows, DEFAULT_SHEET_ID } from './lib/sheet.js'

const API = process.env.GP_API || 'http://127.0.0.1:8789'
const SHEET = process.env.GP_SHEET_ID || DEFAULT_SHEET_ID
const DRY = process.argv.includes('--dry')
const DEBUG = process.argv.includes('--debug')
const ONLY = new Set(process.argv.filter((a) => a.startsWith('--tab=')).map((a) => a.slice(6).toLowerCase()))
const SKIP = new Set((process.env.GP_SKIP_TABS ?? 'rough,Ai test').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))

// Tab → niche label. "2026" is the vendor's top-publications list; "All
// Niches" is a catch-all that shouldn't become a niche tag of its own.
const NICHE_FOR = { '2026': 'Top Publications', 'all niches': '' }

const tabs = await fetchTabs(SHEET)
// "2026" is the vendor's cleanest master list; import it last so its values
// win any conflict with the messier niche tabs (newer non-blank values win).
tabs.sort((a, b) => Number(a.name === '2026') - Number(b.name === '2026'))
console.log(`${tabs.length} tabs found in sheet ${SHEET}\n`)

const grand = { rows: 0, added: 0, updated: 0, skipped: 0 }
for (const t of tabs) {
  const label = t.name.padEnd(20)
  if (ONLY.size && !ONLY.has(t.name.toLowerCase())) continue
  if (SKIP.has(t.name.toLowerCase())) { console.log(`- ${label} skipped (GP_SKIP_TABS)`); continue }
  const grid = await fetchTabGrid(t.gid, SHEET)
  const niche = NICHE_FOR[t.name.toLowerCase()] ?? t.name
  const { rows, cols, header, type, fill, votes, samples } = tabToRows(grid, niche)
  if (DEBUG && cols) {
    const role = Object.fromEntries(Object.entries(cols).flatMap(([k, v]) => (Array.isArray(v) ? v.map((i) => [i, k]) : [[v, k]])))
    console.log(`  ${t.name}: columns`)
    type.forEach((ty, i) => {
      if (!fill[i]) return
      const v = Object.entries(votes[i]).sort((a, b) => b[1] - a[1]).slice(0, 4)
        .map(([k, n]) => `${k}:${n}[${(samples[i][k] || []).join(' | ')}]`).join('  ')
      console.log(`    ${String.fromCharCode(65 + i)}  ${(role[i] || '').padEnd(8)} ${String(ty).padEnd(9)} fill ${String(fill[i]).padStart(4)}  hdr "${header[i].slice(0, 28)}"  ${v}`)
    })
  }
  const found = cols
    ? Object.entries(cols).filter(([, v]) => v !== undefined && !(Array.isArray(v) && !v.length)).map(([k]) => k).join(',')
    : 'no domain column'
  if (!rows.length) { console.log(`- ${label} ${String(grid.length).padStart(4)} lines, 0 sites  (${found})`); continue }

  let res = { added: '-', updated: '-', skipped: '-' }
  if (!DRY) {
    const r = await fetch(`${API}/api/import`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(process.env.ADMIN_API_TOKEN ? { authorization: `Bearer ${process.env.ADMIN_API_TOKEN}` } : {}) },
      body: JSON.stringify({ rows, niche, source: `sheet:${t.name}` }),
    })
    res = await r.json()
    if (!res.ok) throw new Error(`${t.name}: ${res.error}`)
    grand.added += res.added; grand.updated += res.updated; grand.skipped += res.skipped
  }
  grand.rows += rows.length
  console.log(`- ${label} ${String(rows.length).padStart(4)} sites → +${res.added} ~${res.updated} skip ${res.skipped}   [${found}]`)
  if (DRY) {
    const s = rows[0]
    console.log(`    e.g. ${s.name || s.url} | ${s.url} | DA ${s.da ?? '—'} DR ${s.dr ?? '—'} traffic ${s.traffic ?? '—'} | GP ${s.priceGuestPost ?? '—'} LI ${s.priceLinkInsert ?? '—'} | ${s.tat || '—'} | ${s.linkType || '—'} | idx ${s.indexed || '—'} | tags ${s.tags.join(', ') || '—'}`)
  }
}
console.log(`\nTotal ${grand.rows} site rows${DRY ? ' (dry run — nothing posted)' : `: +${grand.added} added, ~${grand.updated} updated, ${grand.skipped} skipped`}`)
