import { crmCache, crmRequest, announceSiteContent } from './crmApi.js';

export const SITE_COPY_PREFIX = 'gems-copy:';
const COPY_EVENT = 'gems-site-copy-updated';
const COLLECTION_PREFIX = 'gems-collection:';
const COLLECTION_EVENT = 'gems-site-collection-updated';

export function sanitizeWebsiteContent(value) {
  if (typeof value === 'string') return value
    .replace(/Krishna Foundation/gi, 'GEMS Group Services')
    .replace(/krishnaconsultnepal@gmail\.com/gi, '')
    .replace(/\+?977[\s.-]*0?1[\s.-]*4795410/gi, '')
    .replace(/\+?977[\s.-]*0?1[\s.-]*4186218/gi, '')
    .replace(/\+?977[\s.-]*035[\s.-]*590060/gi, '')
    .replace(/\+?977[\s.-]*035[\s.-]*590061/gi, '')
    .replace(/\+?977[\s.-]*980[\s.-]*2067676/gi, '')
    .replace(/\+?977[\s.-]*9823417164/gi, '')
    .replace(/Level 4,?\s*Shree Krishna Sadan,?\s*New Baneshwor,?\s*Kathmandu,?\s*Nepal/gi, '')
    .replace(/Triyuga Municipality-11,?\s*Bidhyut Marga,?\s*Gaighat,?\s*Udayapur,?\s*Nepal/gi, '')
    .replace(/D&B Complex Building,?\s*3rd Floor,?\s*Bhanuchowk,?\s*Janakpur Dham,?\s*Nepal/gi, '');
  if (Array.isArray(value)) return value.map(sanitizeWebsiteContent);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeWebsiteContent(item)]));
  return value;
}

export function sanitizeStoredWebsiteContent() {}

export function getSiteCopy(id, fallback = '') {
  const stored = crmCache.siteCopy.get(id);
  return sanitizeWebsiteContent(stored ?? fallback);
}

export async function saveSiteCopy(id, value) {
  const cleanValue = sanitizeWebsiteContent(value);
  await crmRequest('site-content-save', { id, kind: 'copy', value: cleanValue });
  announceSiteContent({ id, kind: 'copy', value: cleanValue });
}

export async function saveSiteCopyBatch(items) {
  const cleanItems = items.map(({ id, value }) => ({ id, kind: 'copy', value: sanitizeWebsiteContent(value) }));
  await crmRequest('site-content-save-many', { items: cleanItems });
  cleanItems.forEach(({ id, value }) => announceSiteContent({ id, kind: 'copy', value }));
}

export async function removeSiteCopy(id) {
  await crmRequest('site-content-remove', { id, kind: 'copy' });
  announceSiteContent({ id, kind: 'copy', value: null });
}

export async function removeSiteCopyBatch(ids) {
  const items = ids.map((id) => ({ id, kind: 'copy' }));
  await crmRequest('site-content-remove-many', { items });
  items.forEach(({ id }) => announceSiteContent({ id, kind: 'copy', value: null }));
}

export function subscribeToSiteCopy(callback) {
  const handler = (event) => callback(event.detail);
  window.addEventListener(COPY_EVENT, handler);
  return () => window.removeEventListener(COPY_EVENT, handler);
}

export function readSiteCollection(id, fallback = []) {
  const stored = crmCache.siteCollections.get(id);
  return Array.isArray(stored) ? sanitizeWebsiteContent(stored) : sanitizeWebsiteContent(fallback);
}

export async function saveSiteCollection(id, items) {
  const cleanItems = sanitizeWebsiteContent(items);
  await crmRequest('site-content-save', { id, kind: 'collection', value: cleanItems });
  announceSiteContent({ id, kind: 'collection', value: cleanItems });
}

export async function removeSiteCollection(id) {
  await crmRequest('site-content-remove', { id, kind: 'collection' });
  announceSiteContent({ id, kind: 'collection', value: null });
}

export function subscribeToSiteCollections(callback) {
  const handler = (event) => callback(event.detail);
  window.addEventListener(COLLECTION_EVENT, handler);
  return () => window.removeEventListener(COLLECTION_EVENT, handler);
}
