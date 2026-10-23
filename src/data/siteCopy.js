export const SITE_COPY_PREFIX = 'krishna-foundation-copy:';
const COPY_EVENT = 'krishna-foundation-copy-updated';
const COLLECTION_PREFIX = 'krishna-foundation-collection:';
const COLLECTION_EVENT = 'krishna-foundation-collection-updated';

export function getSiteCopy(id, fallback = '') {
  try {
    return window.localStorage.getItem(`${SITE_COPY_PREFIX}${id}`) ?? fallback;
  } catch {
    return fallback;
  }
}

export function saveSiteCopy(id, value) {
  window.localStorage.setItem(`${SITE_COPY_PREFIX}${id}`, value);
  window.dispatchEvent(new CustomEvent(COPY_EVENT, { detail: { id, value } }));
}

export function removeSiteCopy(id) {
  window.localStorage.removeItem(`${SITE_COPY_PREFIX}${id}`);
  window.dispatchEvent(new CustomEvent(COPY_EVENT, { detail: { id, value: null } }));
}

export function subscribeToSiteCopy(callback) {
  const handleCustom = (event) => callback(event.detail);
  const handleStorage = (event) => {
    if (event.key?.startsWith(SITE_COPY_PREFIX)) callback({ id: event.key.slice(SITE_COPY_PREFIX.length), value: event.newValue });
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
    return Array.isArray(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

export function saveSiteCollection(id, items) {
  window.localStorage.setItem(`${COLLECTION_PREFIX}${id}`, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(COLLECTION_EVENT, { detail: { id, value: items } }));
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
      callback({ id: event.key.slice(COLLECTION_PREFIX.length), value });
    }
  };
  window.addEventListener(COLLECTION_EVENT, handleCustom);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener(COLLECTION_EVENT, handleCustom);
    window.removeEventListener('storage', handleStorage);
  };
}
