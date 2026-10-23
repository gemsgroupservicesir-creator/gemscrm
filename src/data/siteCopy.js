export const SITE_COPY_PREFIX = 'krishna-foundation-copy:';
const COPY_EVENT = 'krishna-foundation-copy-updated';
const COLLECTION_PREFIX = 'krishna-foundation-collection:';
const COLLECTION_EVENT = 'krishna-foundation-collection-updated';

export function sanitizeWebsiteContent(value) {
  if (typeof value === 'string') {
    return value
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
  }
  if (Array.isArray(value)) return value.map(sanitizeWebsiteContent);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeWebsiteContent(item)]));
  }
  return value;
}

export function sanitizeStoredWebsiteContent() {
  try {
    const obsoleteContactCopyIds = [
      'contact-phone', 'contact-email', 'contact-address', 'contact-office-hours', 'contact-hours-label',
      'contact-offices-heading', 'contact-offices-eyebrow', 'contact-office-0-title', 'contact-office-0-phone',
      'contact-office-1-title', 'contact-office-1-address', 'contact-office-1-phone', 'contact-office-2-title',
      'contact-office-2-address', 'contact-office-2-phone', 'contact-office-option-0', 'contact-office-option-1',
      'contact-office-option-2',
    ];
    obsoleteContactCopyIds.forEach((id) => window.localStorage.removeItem(`${SITE_COPY_PREFIX}${id}`));

    Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))
      .filter((key) => key?.startsWith(SITE_COPY_PREFIX) || key?.startsWith(COLLECTION_PREFIX))
      .forEach((key) => {
        const current = window.localStorage.getItem(key);
        if (current === null) return;
        let next = sanitizeWebsiteContent(current);
        if (key.startsWith(COLLECTION_PREFIX)) {
          try { next = JSON.stringify(sanitizeWebsiteContent(JSON.parse(current))); } catch { return; }
        }
        if (next !== current) window.localStorage.setItem(key, next);
      });
  } catch {
    // The site remains usable when browser storage is unavailable.
  }
}

export function getSiteCopy(id, fallback = '') {
  try {
    const key = `${SITE_COPY_PREFIX}${id}`;
    const stored = window.localStorage.getItem(key);
    const clean = sanitizeWebsiteContent(stored ?? fallback);
    if (stored !== null && clean !== stored) window.localStorage.setItem(key, clean);
    return clean;
  } catch {
    return sanitizeWebsiteContent(fallback);
  }
}

export function saveSiteCopy(id, value) {
  const cleanValue = sanitizeWebsiteContent(value);
  window.localStorage.setItem(`${SITE_COPY_PREFIX}${id}`, cleanValue);
  window.dispatchEvent(new CustomEvent(COPY_EVENT, { detail: { id, value: cleanValue } }));
}

export function removeSiteCopy(id) {
  window.localStorage.removeItem(`${SITE_COPY_PREFIX}${id}`);
  window.dispatchEvent(new CustomEvent(COPY_EVENT, { detail: { id, value: null } }));
}

export function subscribeToSiteCopy(callback) {
  const handleCustom = (event) => callback(event.detail);
  const handleStorage = (event) => {
    if (event.key?.startsWith(SITE_COPY_PREFIX)) callback({ id: event.key.slice(SITE_COPY_PREFIX.length), value: sanitizeWebsiteContent(event.newValue) });
  };
  window.addEventListener(COPY_EVENT, handleCustom);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener(COPY_EVENT, handleCustom);
    window.removeEventListener('storage', handleStorage);
  };
}

export function readSiteCollection(id, fallback = []) {
  try {
    const stored = window.localStorage.getItem(`${COLLECTION_PREFIX}${id}`);
    if (stored === null) return fallback;
    const value = JSON.parse(stored);
    if (!Array.isArray(value)) return sanitizeWebsiteContent(fallback);
    const clean = sanitizeWebsiteContent(value);
    if (JSON.stringify(clean) !== stored) window.localStorage.setItem(`${COLLECTION_PREFIX}${id}`, JSON.stringify(clean));
    return clean;
  } catch {
    return sanitizeWebsiteContent(fallback);
  }
}

export function saveSiteCollection(id, items) {
  const cleanItems = sanitizeWebsiteContent(items);
  window.localStorage.setItem(`${COLLECTION_PREFIX}${id}`, JSON.stringify(cleanItems));
  window.dispatchEvent(new CustomEvent(COLLECTION_EVENT, { detail: { id, value: cleanItems } }));
}

export function removeSiteCollection(id) {
  window.localStorage.removeItem(`${COLLECTION_PREFIX}${id}`);
  window.dispatchEvent(new CustomEvent(COLLECTION_EVENT, { detail: { id, value: null } }));
}

export function subscribeToSiteCollections(callback) {
  const handleCustom = (event) => callback(event.detail);
  const handleStorage = (event) => {
    if (event.key?.startsWith(COLLECTION_PREFIX)) {
      let value = null;
      try { value = event.newValue === null ? null : JSON.parse(event.newValue); } catch { value = null; }
      callback({ id: event.key.slice(COLLECTION_PREFIX.length), value: sanitizeWebsiteContent(value) });
    }
  };
  window.addEventListener(COLLECTION_EVENT, handleCustom);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener(COLLECTION_EVENT, handleCustom);
    window.removeEventListener('storage', handleStorage);
  };
}
