const STORAGE_KEY = 'krishna-foundation-crm-counselors-v1';
const UPDATE_EVENT = 'krishna-foundation-crm-counselors-updated';

export const DEFAULT_COUNSELORS = [
  { id: 'counselor-1', name: 'Counselor 1', username: '', credential: null, permissions: { leads: true, website: false, landingPages: false } },
  { id: 'counselor-2', name: 'Counselor 2', username: '', credential: null, permissions: { leads: true, website: false, landingPages: false } },
  { id: 'counselor-3', name: 'Counselor 3', username: '', credential: null, permissions: { leads: true, website: false, landingPages: false } },
];

export function readCounselors() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === null) return DEFAULT_COUNSELORS.map((counselor) => ({ ...counselor, permissions: { ...counselor.permissions } }));
    const saved = JSON.parse(stored);
    if (!Array.isArray(saved)) return DEFAULT_COUNSELORS.map((counselor) => ({ ...counselor, permissions: { ...counselor.permissions } }));
    return saved.filter((item) => item && typeof item.id === 'string' && item.id).map((item) => ({
      id: item.id,
      name: String(item.name || 'Counselor'),
      username: String(item.username || ''),
      credential: item.credential || null,
      permissions: { leads: true, website: false, landingPages: false, ...(item.permissions || {}) },
    }));
  } catch {
    return DEFAULT_COUNSELORS.map((counselor) => ({ ...counselor, permissions: { ...counselor.permissions } }));
  }
}

export function saveCounselors(counselors) {
  const saved = counselors.filter((item) => item && typeof item.id === 'string' && item.id).map((item) => ({
    id: item.id,
    name: String(item.name || 'Counselor').trim() || 'Counselor',
    username: String(item.username || '').trim().toLowerCase(),
    credential: item.credential || null,
    permissions: { leads: true, website: false, landingPages: false, ...(item.permissions || {}) },
  }));
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  window.dispatchEvent(new Event(UPDATE_EVENT));
  return saved;
}

export function updateCounselor(id, changes) {
  const counselors = readCounselors().map((counselor) => counselor.id === id ? {
    ...counselor,
    ...changes,
    permissions: { ...counselor.permissions, ...(changes.permissions || {}) },
  } : counselor);
  return saveCounselors(counselors);
}

export function subscribeToCounselors(callback) {
  const refresh = () => callback(readCounselors());
  window.addEventListener(UPDATE_EVENT, refresh);
  window.addEventListener('storage', refresh);
  return () => {
    window.removeEventListener(UPDATE_EVENT, refresh);
    window.removeEventListener('storage', refresh);
  };
}
