const UPDATE_EVENTS = {
  leads: 'gems-crm-leads-updated',
  counselors: 'gems-crm-counselors-updated',
  attendance: 'gems-crm-attendance-updated',
  dailyReports: 'gems-crm-daily-reports-updated',
  landingPages: 'gems-crm-landing-pages-updated',
};

export const crmCache = {
  leads: [],
  counselors: [],
  attendance: [],
  dailyReports: [],
  landingPages: [],
  siteCopy: new Map(),
  siteCollections: new Map(),
};

export async function crmRequest(action, body, params = {}) {
  const query = new URLSearchParams({ action, ...params });
  const response = await fetch(`/api/crm?${query.toString()}`, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: body === undefined ? { Accept: 'application/json' } : { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  let result = {};
  try { result = await response.json(); } catch { /* Report a generic server error below. */ }
  if (!response.ok) throw new Error(result.error || 'The CRM service is temporarily unavailable.');
  return result;
}

function announce(key, value) {
  crmCache[key] = value;
  window.dispatchEvent(new CustomEvent(UPDATE_EVENTS[key], { detail: value }));
}

export function announceSiteContent({ id, kind, value }) {
  const target = kind === 'collection' ? crmCache.siteCollections : crmCache.siteCopy;
  if (value === null) target.delete(id); else target.set(id, value);
  window.dispatchEvent(new CustomEvent(kind === 'collection' ? 'gems-site-collection-updated' : 'gems-site-copy-updated', { detail: { id, value } }));
}

function applySiteItems(items = []) {
  crmCache.siteCopy.clear();
  crmCache.siteCollections.clear();
  for (const item of items) announceSiteContent(item);
}

export async function loadCrmData() {
  const data = await crmRequest('data');
  announce('leads', data.leads || []);
  announce('counselors', data.counselors || []);
  announce('attendance', data.attendance || []);
  announce('dailyReports', data.dailyReports || []);
  announce('landingPages', data.landingPages || []);
  if (data.siteContent) applySiteItems(data.siteContent);
  return data;
}

export async function loadPublicSiteContent() {
  try {
    const data = await crmRequest('public-content');
    applySiteItems(data.items || []);
  } catch {
    // Static website defaults remain available while the database is being configured.
  }
}

export async function fetchPublicLandingPage(slug, preview = false) {
  const data = await crmRequest('public-landing-page', undefined, { slug, ...(preview ? { preview: '1' } : {}) });
  return data.page || null;
}

export function subscribeToCache(key, callback) {
  const event = UPDATE_EVENTS[key];
  const refresh = (detail) => callback(detail?.detail ?? crmCache[key]);
  window.addEventListener(event, refresh);
  return () => window.removeEventListener(event, refresh);
}

export function readCache(key) { return crmCache[key] || []; }

export async function refreshCrmData() {
  try { return await loadCrmData(); } catch { return null; }
}
