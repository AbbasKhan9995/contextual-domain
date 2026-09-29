// Starter inventory — real rows read from the "( May 2026 ) MAIN LIST" sheet,
// "2026 / Top 1000+ Publication" tab. The full list arrives via the import
// endpoint once the sheet feed is connected; this just means the tool is not
// empty on first run.

export const SEED_NICHE = 'Top Publications'

export const SEED_ROWS = [
  { name: 'The Stupid Bear', url: 'thestupidbear.com', da: 22, dr: 25, traffic: 41300, gp: 150, li: 125, tat: '7 Days', links: '2 Do-Follow', index: 'Yes' },
  { name: 'Augusta Free Press', url: 'augustafreepress.com', da: 64, dr: 74, traffic: 20400, gp: 150, li: null, tat: '48h', links: '3 Do-Follow', index: 'Yes' },
  { name: 'MSN', url: 'msn.com (1 Year Guaranteed)', da: 94, dr: 92, traffic: 29293531, gp: 300, li: null, tat: '72h', links: '2 Do-Follow', index: 'Yes' },
  { name: 'HackerNoon', url: 'hackernoon.com', da: 87, dr: 87, traffic: 95548, gp: 350, li: null, tat: '7 Days', links: '2 Do-Follow', index: 'Yes' },
  { name: 'Wallpapers.com', url: 'wallpapers.com', da: 92, dr: 83, traffic: 1853453, gp: 3500, li: 3500, tat: '7 Days', links: '2 Do-Follow', index: 'Yes' },
  { name: 'Punch Newspapers', url: 'punchng.com', da: 86, dr: 82, traffic: 1439882, gp: 350, li: null, tat: '72h', links: '1 Do-Follow', index: 'Yes' },
  { name: 'The Guardian Nigeria', url: 'guardian.ng', da: 86, dr: 81, traffic: 361600, gp: 320, li: null, tat: '72h', links: '1 Do-Follow', index: 'Yes' },
  { name: 'BusinessDay', url: 'businessday.ng (Sponsored)', da: 58, dr: 79, traffic: 144611, gp: 350, li: null, tat: '72h', links: '2 Do-Follow', index: 'Yes' },
  { name: 'Tribune Online', url: 'tribuneonlineng.com', da: 85, dr: 75, traffic: 101983, gp: 250, li: 200, tat: '72h', links: '2 Do-Follow', index: 'Yes' },
  { name: 'Vanguard News', url: 'vanguardngr.com', da: 81, dr: 83, traffic: 555880, gp: 260, li: null, tat: '72h', links: '1 Do-Follow', index: 'Yes' },
  { name: 'LEADERSHIP Newspapers', url: 'leadership.ng', da: 81, dr: 74, traffic: 222563, gp: 320, li: 200, tat: '72h', links: '1 Do-Follow', index: 'Yes' },
  { name: 'P.M. News', url: 'pmnewsnigeria.com', da: 68, dr: 70, traffic: 57846, gp: 210, li: null, tat: '72h', links: '1 Do-Follow', index: 'Yes' },
  { name: 'Independent Newspaper Nigeria', url: 'independent.ng', da: 68, dr: 72, traffic: 15553, gp: 250, li: 200, tat: '72h', links: '1 Do-Follow', index: 'Yes' },
  { name: 'The Nation Newspaper', url: 'thenationonlineng.net', da: 82, dr: 67, traffic: 272012, gp: 250, li: null, tat: '72h', links: '1 Do-Follow', index: 'Yes' },
  { name: 'THISDAYLIVE', url: 'thisdaylive.com', da: 79, dr: 78, traffic: 119881, gp: 250, li: null, tat: '72h', links: '1 Do-Follow', index: 'Yes' },
  { name: 'New Telegraph', url: 'newtelegraphng.com', da: 41, dr: 65, traffic: 39242, gp: 210, li: null, tat: '72h', links: '1 Do-Follow', index: 'Yes' },
  { name: 'Entrepreneurs.ng', url: 'entrepreneurs.ng', da: 48, dr: 40, traffic: 465, gp: 210, li: null, tat: '72h', links: '1 Do-Follow', index: 'Yes' },
  { name: 'The Sun Nigeria', url: 'thesun.ng', da: 75, dr: 73, traffic: 83922, gp: 210, li: null, tat: '72h', links: '2 Do-Follow', index: 'Yes' },
  { name: 'Daily Trust', url: 'dailytrust.com', da: 75, dr: 74, traffic: 84350, gp: 260, li: null, tat: '72h', links: '2 Do-Follow', index: 'Yes' },
].map((r) => ({
  'Websites Name': r.name,
  URL: r.url,
  'MOZ DA': r.da,
  'Ahrefs DR': r.dr,
  'Ahrefs Traffic': r.traffic,
  'Guest Post': r.gp,
  'Link Insert': r.li ?? 'NIL',
  TAT: r.tat,
  'Link Type': r.links,
  Index: r.index,
  Niche: SEED_NICHE,
}))
