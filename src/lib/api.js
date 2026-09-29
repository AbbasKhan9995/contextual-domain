const call = async (method, url, body) => {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }))
  // Session gone (logged out elsewhere, expired): the app shell shows the login.
  if (res.status === 401 && !url.startsWith('/api/auth/')) window.dispatchEvent(new Event('gp:unauthorized'))
  if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

const qs = (o = {}) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(o)) if (v !== '' && v !== null && v !== undefined) p.set(k, v)
  const s = p.toString()
  return s ? `?${s}` : ''
}

export const api = {
  stats: () => call('GET', '/api/stats'),
  niches: () => call('GET', '/api/niches'),
  facets: () => call('GET', '/api/facets'),
  enrich: () => call('GET', '/api/enrich'),
  enrichBatch: (before) => call('POST', '/api/enrich/batch', { before }),
  // auth + accounts
  me: () => call('GET', '/api/auth/me'),
  setup: (b) => call('POST', '/api/auth/setup', b),
  login: (b) => call('POST', '/api/auth/login', b),
  logout: () => call('POST', '/api/auth/logout'),
  changePassword: (b) => call('POST', '/api/auth/password', b),
  users: () => call('GET', '/api/users'),
  addUser: (b) => call('POST', '/api/users', b),
  updateUser: (id, b) => call('PATCH', `/api/users/${id}`, b),
  deleteUser: (id) => call('DELETE', `/api/users/${id}`),
  // client requests (admin) + portal (client)
  requests: () => call('GET', '/api/requests'),
  convertRequest: (id) => call('POST', `/api/requests/${id}/convert`),
  updateRequest: (id, b) => call('PATCH', `/api/requests/${id}`, b),
  portalCatalogs: () => call('GET', '/api/portal/catalogs'),
  portalOrders: () => call('GET', '/api/portal/orders'),
  portalRequests: () => call('GET', '/api/portal/requests'),
  portalRequest: (b) => call('POST', '/api/portal/requests', b),
  // admin tools
  restoreBackup: (b) => call('POST', '/api/backup', b),
  syncSheet: () => call('POST', '/api/sync-sheet'),
  sites: (f) => call('GET', `/api/sites${qs(f)}`),
  addSite: (b) => call('POST', '/api/sites', b),
  updateSite: (id, b) => call('PATCH', `/api/sites/${id}`, b),
  deleteSite: (id) => call('DELETE', `/api/sites/${id}`),
  importRows: (b) => call('POST', '/api/import', b),
  importHistory: () => call('GET', '/api/import/history'),
  clients: () => call('GET', '/api/clients'),
  addClient: (b) => call('POST', '/api/clients', b),
  updateClient: (id, b) => call('PATCH', `/api/clients/${id}`, b),
  deleteClient: (id) => call('DELETE', `/api/clients/${id}`),
  orders: (f) => call('GET', `/api/orders${qs(f)}`),
  addOrder: (b) => call('POST', '/api/orders', b),
  updateOrder: (id, b) => call('PATCH', `/api/orders/${id}`, b),
  deleteOrder: (id) => call('DELETE', `/api/orders/${id}`),
  report: (clientId) => call('GET', `/api/report/${clientId}`),
  // Raw body upload: the file bytes are the request body, its name a header.
  // Hosted: browser → Vercel Blob with a short-lived token, then register.
  // Local: the file bytes are the request body, its name a header.
  uploadOrderFile: async (id, file, storage = 'local') => {
    if (storage === 'blob') {
      const { clientToken, pathname } = await call('POST', `/api/orders/${id}/upload-token`, { name: file.name, size: file.size })
      const { put } = await import('@vercel/blob/client')
      const blob = await put(pathname, file, { access: 'public', token: clientToken })
      return call('POST', `/api/orders/${id}/files/register`, { name: file.name, size: file.size, url: blob.url })
    }
    const res = await fetch(`/api/orders/${id}/files`, { method: 'POST', headers: { 'x-filename': encodeURIComponent(file.name), 'content-type': 'application/octet-stream' }, body: file })
    const data = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }))
    if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`)
    return data
  },
  deleteOrderFile: (id, name) => call('DELETE', `/api/orders/${id}/files/${encodeURIComponent(name)}`),
  orderFileUrl: (id, name) => `/api/orders/${id}/files/${encodeURIComponent(name)}`,
  content: (f) => call('GET', `/api/content${qs(f)}`),
  addContent: (b) => call('POST', '/api/content', b),
  updateContent: (id, b) => call('PATCH', `/api/content/${id}`, b),
  deleteContent: (id) => call('DELETE', `/api/content/${id}`),
  assignContent: (id, b) => call('POST', `/api/content/${id}/assign`, b),
  unassignContent: (id) => call('POST', `/api/content/${id}/unassign`),
  suggestSites: (id, f) => call('GET', `/api/content/${id}/suggest${qs(f)}`),
  contentInsights: (clientId) => call('GET', `/api/content/insights${qs({ clientId })}`),
  catalogs: () => call('GET', '/api/catalogs'),
  addCatalog: (b) => call('POST', '/api/catalogs', b),
  updateCatalog: (id, b) => call('PATCH', `/api/catalogs/${id}`, b),
  deleteCatalog: (id) => call('DELETE', `/api/catalogs/${id}`),
  previewCatalog: (b) => call('POST', '/api/catalogs/preview', b),
  resolveCodes: (b) => call('POST', '/api/catalogs/resolve', b),
  bulkOrders: (b) => call('POST', '/api/orders/bulk', b),
  bundles: () => call('GET', '/api/bundles'),
  previewBundle: (b) => call('POST', '/api/bundles/preview', b),
  addBundle: (b) => call('POST', '/api/bundles', b),
  updateBundle: (id, b) => call('PATCH', `/api/bundles/${id}`, b),
  deleteBundle: (id) => call('DELETE', `/api/bundles/${id}`),
  assignBundle: (id, b) => call('POST', `/api/bundles/${id}/assign`, b),
  links: () => call('GET', '/api/links'),
  checkLinks: (orderIds) => call('POST', '/api/links/check', { orderIds }),
}

export const fmtNum = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString())
export const fmtMoney = (n) => (n === null || n === undefined ? '—' : `$${Number(n).toLocaleString()}`)
// List prices: null = unknown, 0 = the vendor's "NIL" (not offered).
export const fmtPrice = (n) => (n === null || n === undefined ? '—' : n === 0 ? 'NIL' : `$${Number(n).toLocaleString()}`)
export const fmtDate = (s) => (s ? new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
