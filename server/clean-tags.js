// One-off maintenance: re-apply tag hygiene (cleanTags) to sites already in
// the store. Safe to run while the API is up — it reads the file per request
// and never caches. Prints what changed.
//
//   node server/clean-tags.js

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { cleanTags } from './lib/normalize.js'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = process.env.GP_DATA_DIR || path.join(ROOT, '.data')
const file = path.join(DATA_DIR, 'sites.json')

const sites = JSON.parse(fs.readFileSync(file, 'utf8'))
const before = new Set(sites.flatMap((s) => s.tags || []))
const dropped = new Map()
let changed = 0
for (const s of sites) {
  const next = cleanTags(s.tags || [])
  if (next.length !== (s.tags || []).length) {
    for (const t of s.tags) if (!next.includes(t)) dropped.set(t, (dropped.get(t) || 0) + 1)
    s.tags = next
    changed++
  }
}
const after = new Set(sites.flatMap((s) => s.tags || []))

const tmp = file + '.tmp'
fs.writeFileSync(tmp, JSON.stringify(sites, null, 2))
fs.renameSync(tmp, file)

console.log(`${changed} sites changed; distinct tags ${before.size} → ${after.size}`)
console.log('dropped (most common):', [...dropped.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t, n]) => `"${t}"×${n}`).join(', '))
