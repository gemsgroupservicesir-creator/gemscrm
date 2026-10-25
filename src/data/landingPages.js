import { sanitizeWebsiteContent } from './siteCopy.js';
import { crmCache, crmRequest, readCache, refreshCrmData, subscribeToCache } from './crmApi.js';

export function readLandingPages() { return readCache('landingPages'); }
export function subscribeToLandingPages(callback) { return subscribeToCache('landingPages', callback); }

export async function saveLandingPage(page) {
  const result = await crmRequest('landing-page-save', { page: sanitizeWebsiteContent(page) });
  const pages = [result.page, ...readLandingPages().filter((item) => item.id !== result.page.id)];
  crmCache.landingPages = pages;
  window.dispatchEvent(new CustomEvent('gems-crm-landing-pages-updated', { detail: pages }));
  return result.page;
}

export async function deleteLandingPage(id) {
  await crmRequest('landing-page-delete', { id });
  const pages = readLandingPages().filter((page) => page.id !== id);
  crmCache.landingPages = pages;
  window.dispatchEvent(new CustomEvent('gems-crm-landing-pages-updated', { detail: pages }));
}

export function resolveLandingPage(pathname, search = '') {
  const match = pathname.match(/^\/landing\/([^/]+)\/?$/);
  if (!match) return null;
  const slug = decodeURIComponent(match[1]);
  const page = readLandingPages().find((item) => item.slug === slug);
  if (!page) return null;
  return { ...page, preview: new URLSearchParams(search).get('preview') === '1' };
}

export function newLandingPage() {
  const now = new Date().toISOString();
  return {
    id: window.crypto?.randomUUID?.() || `landing-${Date.now()}`,
    name: 'New campaign page', slug: 'new-campaign', eyebrow: 'ACADEMIC GUIDANCE · BIRGUNJ, NEPAL',
    headline: 'Find a study path that fits your goals.',
    description: 'Share your academic interests and qualifications. GEMS Group Services can help you explore course options and understand admission steps.',
    formTitle: 'Request a consultation', buttonLabel: 'Send enquiry', theme: 'blue', campaignImage: '',
    fields: ['phone', 'faculty', 'image'], phoneRequired: true, facultyRequired: true, imageRequired: false,
    customFields: [], assignedCounselorId: '', published: false, qrEnabled: false, createdAt: now, updatedAt: now,
  };
}
