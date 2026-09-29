// Fields derived from the raw vendor values at read time. The vendor writes
// the same thing a dozen ways ("1 Do-Follow", "2-Dofollow", "1 DOFOLLOW",
// "72H", "24-72 hours", "1 Week") — the raw text stays on the record as the
// source of truth, and these parsers turn it into values that can be
// filtered and sorted. Nothing here is stored, so a re-sync can never leave
// a stale derived value behind.

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()

/** "2 Do-follow" → { follow: 'dofollow', maxLinks: 2 }
 *  "Sponsored + No-Follow" → { follow: 'nofollow', sponsored: true }
 *  "2-3 Dofollows" → maxLinks 3 (the upper bound is what the site allows). */
export function parseLinkType(raw, note = '') {
  const s = norm(raw).toLowerCase()
  const out = { follow: null, maxLinks: null, sponsored: /sponsor/i.test(`${raw} ${note}`) ? true : null }
  if (!s) return out
  if (/no-?\s?follow/.test(s)) out.follow = 'nofollow'
  else if (/do-?\s?follow/.test(s)) out.follow = 'dofollow'
  const range = s.match(/^(\d+)\s*[-–]\s*(\d+)/)
  const one = s.match(/^(\d+)/)
  if (range) out.maxLinks = Number(range[2])
  else if (one) out.maxLinks = Number(one[1])
  return out
}

/** Turnaround text → days (upper bound of a range). "72H" → 3, "2-3 days" → 3,
 *  "24-72 hours" → 3, "1 Week" → 7, "3/4 Weeks" → 28, "1 Month" → 30. */
export function tatDays(raw) {
  const s = norm(raw).toLowerCase()
  if (!s) return null
  const m = s.match(/(\d+(?:\.\d+)?)(?:\s*[-–/]\s*(\d+(?:\.\d+)?))?\s*(h|hours?|hrs?|d|days?|w|weeks?|m|months?)?\b/)
  if (!m) return null
  const n = Number(m[2] ?? m[1])
  const unit = (m[3] || 'd')[0]
  const days = unit === 'h' ? n / 24 : unit === 'w' ? n * 7 : unit === 'm' ? n * 30 : n
  return Math.round(days * 10) / 10
}

// Country-code TLDs → country. Generic-use ccTLDs (.co .io .ai .tv .me .fm .cc
// .ly .gg) are left out on purpose: they say nothing about where a site is.
const CC = {
  uk: 'United Kingdom', au: 'Australia', ng: 'Nigeria', in: 'India', ca: 'Canada', de: 'Germany',
  fr: 'France', es: 'Spain', it: 'Italy', nl: 'Netherlands', be: 'Belgium', ch: 'Switzerland',
  at: 'Austria', se: 'Sweden', no: 'Norway', dk: 'Denmark', fi: 'Finland', pl: 'Poland',
  pt: 'Portugal', ie: 'Ireland', nz: 'New Zealand', za: 'South Africa', ke: 'Kenya', gh: 'Ghana',
  ae: 'United Arab Emirates', sa: 'Saudi Arabia', qa: 'Qatar', pk: 'Pakistan', bd: 'Bangladesh',
  lk: 'Sri Lanka', np: 'Nepal', sg: 'Singapore', my: 'Malaysia', ph: 'Philippines', id: 'Indonesia',
  th: 'Thailand', vn: 'Vietnam', jp: 'Japan', kr: 'South Korea', cn: 'China', hk: 'Hong Kong',
  tw: 'Taiwan', br: 'Brazil', mx: 'Mexico', ar: 'Argentina', cl: 'Chile', pe: 'Peru', ru: 'Russia',
  ua: 'Ukraine', tr: 'Turkey', gr: 'Greece', ro: 'Romania', cz: 'Czechia', hu: 'Hungary',
  il: 'Israel', eg: 'Egypt', ma: 'Morocco', us: 'United States', ug: 'Uganda', tz: 'Tanzania',
  zw: 'Zimbabwe', cy: 'Cyprus', mt: 'Malta', lu: 'Luxembourg', is: 'Iceland', ee: 'Estonia',
  lt: 'Lithuania', lv: 'Latvia', sk: 'Slovakia', si: 'Slovenia', hr: 'Croatia', rs: 'Serbia', bg: 'Bulgaria',
}
// ISO region codes as they appear in <html lang="en-GB"> → the same names.
const REGION = { GB: 'uk', UK: 'uk', AU: 'au', NG: 'ng', IN: 'in', CA: 'ca', DE: 'de', FR: 'fr', ES: 'es', IT: 'it', NL: 'nl', IE: 'ie', NZ: 'nz', ZA: 'za', KE: 'ke', GH: 'gh', AE: 'ae', SA: 'sa', PK: 'pk', SG: 'sg', MY: 'my', PH: 'ph', BR: 'br', MX: 'mx', US: 'us' }

export const countryFromTld = (domain) => CC[String(domain).split('.').pop()] || null

/** Best country guess and where it came from. The TLD wins; a deliberate
 *  non-US region in the page's lang tag comes second. "en-US" is WordPress's
 *  default, so it is not evidence of a US site and is ignored. */
export function countryOf(site) {
  const tld = countryFromTld(site.url)
  if (tld) return { country: tld, countrySource: 'domain' }
  const region = site.langRegion && REGION[site.langRegion.toUpperCase()]
  if (region && region !== 'us') return { country: CC[region], countrySource: 'page language' }
  return { country: null, countrySource: null }
}

const LANG = { en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese', nl: 'Dutch', ar: 'Arabic', ur: 'Urdu', hi: 'Hindi', id: 'Indonesian', ru: 'Russian', tr: 'Turkish', pl: 'Polish', sv: 'Swedish', ja: 'Japanese', ko: 'Korean', zh: 'Chinese', vi: 'Vietnamese', th: 'Thai', ro: 'Romanian', el: 'Greek', cs: 'Czech', da: 'Danish', fi: 'Finnish', no: 'Norwegian', nb: 'Norwegian', he: 'Hebrew', fa: 'Persian', bn: 'Bengali', ms: 'Malay', tl: 'Filipino', uk: 'Ukrainian', hu: 'Hungarian' }
export const languageName = (code) => (code ? LANG[code.toLowerCase()] || code.toLowerCase() : null)

// Hosting and user-generated platforms. A listing on one of these inherits
// the platform's DR/DA (s3.amazonaws.com shows DR 95), but the post sits on a
// page nobody edits or links to — the metric is not the publication's.
const PLATFORMS = [
  'amazonaws.com', 'cloudfront.net', 'googleusercontent.com', 'azurewebsites.net', 'herokuapp.com',
  'vercel.app', 'netlify.app', 'pages.dev', 'firebaseapp.com', 'web.app', 'github.io', 'gitlab.io',
  'blogspot.com', 'blogger.com', 'wordpress.com', 'wixsite.com', 'weebly.com', 'squarespace.com',
  'webflow.io', 'strikingly.com', 'jimdosite.com', 'site123.me', 'godaddysites.com', 'notion.site',
  'medium.com', 'substack.com', 'tumblr.com', 'livejournal.com', 'hubpages.com', 'over-blog.com',
  'sites.google.com', 'reddit.com', 'quora.com', 'linkedin.com', 'pinterest.com', 'facebook.com',
  'twitter.com', 'x.com', 'youtube.com', 'instagram.com', 'tiktok.com', 'issuu.com', 'scribd.com',
  'slideshare.net', 'behance.net', 'dribbble.com', 'wattpad.com', 'telegra.ph', 'hashnode.dev', 'dev.to',
]
export function platformOf(domain) {
  const d = String(domain).toLowerCase()
  return PLATFORMS.find((p) => d === p || d.endsWith(`.${p}`)) || null
}

/** Every derived field for one site, ready to spread into the API response. */
export function derive(site) {
  const link = parseLinkType(site.linkType, site.note)
  const platform = platformOf(site.url)
  const flags = []
  if (platform) flags.push(`Hosting/UGC platform (${platform}) — DR/DA belong to the platform, not a publication`)
  if (site.parked) flags.push('Parked / domain-for-sale page')
  else if (site.live === false) flags.push(site.httpStatus ? `Site returned HTTP ${site.httpStatus}` : 'Site did not respond')
  if (site.redirectHost) flags.push(`Redirects to ${site.redirectHost}`)
  return {
    follow: link.follow,
    maxLinks: link.maxLinks,
    sponsored: link.sponsored,
    tatDays: tatDays(site.tat),
    ...countryOf(site),
    language: languageName(site.langCode),
    platform,
    flags,
  }
}
