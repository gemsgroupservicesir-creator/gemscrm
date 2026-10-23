import { sanitizeWebsiteContent } from './siteCopy.js';

const STORAGE_KEY = 'krishna-foundation-crm-landing-pages-v1';
const CHANGE_EVENT = 'krishna-foundation-landing-pages-updated';

export function readLandingPages() {
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(value)) return [];
    const clean = sanitizeWebsiteContent(value);
    if (JSON.stringify(clean) !== JSON.stringify(value)) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    return clean;
  } catch {
    return [];
  }
}

export function saveLandingPage(page) {
  const pages = readLandingPages();
  const duplicate = pages.find((item) => item.slug === page.slug && item.id !== page.id);
  if (duplicate) throw new Error('That page link is already in use. Choose a different link.');
  const next = sanitizeWebsiteContent({ ...page, updatedAt: new Date().toISOString() });
  const existingIndex = pages.findIndex((item) => item.id === page.id);
  if (existingIndex === -1) pages.unshift(next);
  else pages[existingIndex] = next;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pages));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  return next;
}

export function deleteLandingPage(id) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(readLandingPages().filter((page) => page.id !== id)));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export function subscribeToLandingPages(callback) {
  const refresh = () => callback(readLandingPages());
  const handleStorage = (event) => { if (event.key === STORAGE_KEY) refresh(); };
  window.addEventListener(CHANGE_EVENT, refresh);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, refresh);
    window.removeEventListener('storage', handleStorage);
  };
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
    name: 'New campaign page',
    slug: 'new-campaign',
    eyebrow: 'ACADEMIC GUIDANCE · BIRGUNJ, NEPAL',
    headline: 'Find a study path that fits your goals.',
    description: 'Share your academic interests and qualifications. GEMS Group Services can help you explore course options and understand admission steps.',
    formTitle: 'Request a consultation',
    buttonLabel: 'Send enquiry',
    theme: 'blue',
    campaignImage: '',
    fields: ['phone', 'faculty', 'image'],
    phoneRequired: true,
    facultyRequired: true,
    imageRequired: false,
    customFields: [],
    assignedCounselorId: '',
    published: false,
    createdAt: now,
    updatedAt: now,
  };
}
