// Logins without a session table: the cookie carries { uid, exp } signed
// with HMAC-SHA256. Passwords use scrypt from node:crypto (no native deps).

import { scryptSync, randomBytes, timingSafeEqual, createHmac } from 'node:crypto'

export const COOKIE = 'gp_session'
const SESSION_DAYS = 14

export function hashPassword(pw) {
  const salt = randomBytes(16)
  const hash = scryptSync(String(pw), salt, 64, { N: 16384, r: 8, p: 1 })
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

export function verifyPassword(pw, stored) {
  const [kind, saltHex, hashHex] = String(stored || '').split('$')
  if (kind !== 'scrypt' || !saltHex || !hashHex) return false
  const want = Buffer.from(hashHex, 'hex')
  const got = scryptSync(String(pw), Buffer.from(saltHex, 'hex'), want.length, { N: 16384, r: 8, p: 1 })
  return timingSafeEqual(want, got)
}

/** Readable temporary password: 4 groups of 4, no look-alike characters. */
export function tempPassword() {
  const abc = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const b = randomBytes(16)
  return Array.from(b, (x) => abc[x % abc.length]).join('').replace(/(.{4})(?=.)/g, '$1-')
}

export const passwordProblem = (pw) => (String(pw || '').length < 10 ? 'Use at least 10 characters.' : null)

const b64 = (s) => Buffer.from(s).toString('base64url')
const sign = (data, secret) => createHmac('sha256', secret).update(data).digest('base64url')

export function makeToken(uid, secret, days = SESSION_DAYS) {
  const body = b64(JSON.stringify({ uid, exp: Date.now() + days * 864e5 }))
  return `${body}.${sign(body, secret)}`
}

export function readToken(token, secret) {
  const [body, mac] = String(token || '').split('.')
  if (!body || !mac) return null
  const want = Buffer.from(sign(body, secret)), got = Buffer.from(mac)
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString())
    return p.exp > Date.now() ? p : null
  } catch { return null }
}

export function parseCookies(header) {
  const out = {}
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

export function sessionCookie(token, { secure, clear = false } = {}) {
  const attrs = ['Path=/', 'HttpOnly', 'SameSite=Lax', clear ? 'Max-Age=0' : `Max-Age=${SESSION_DAYS * 86400}`]
  if (secure) attrs.push('Secure')
  return `${COOKIE}=${clear ? '' : encodeURIComponent(token)}; ${attrs.join('; ')}`
}

export const publicUser = (u) => u && { id: u.id, email: u.email, name: u.name, role: u.role, clientId: u.clientId || null, mustChangePassword: !!u.mustChangePassword }
