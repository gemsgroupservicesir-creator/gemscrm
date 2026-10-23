const STORAGE_KEY = 'krishna-foundation-crm-counselors-v1';
const UPDATE_EVENT = 'krishna-foundation-crm-counselors-updated';

export const DEFAULT_COUNSELORS = [
  { id: 'counselor-1', name: 'Counselor 1', username: '', credential: null, permissions: { leads: true, website: false, landingPages: false } },
  { id: 'counselor-2', name: 'Counselor 2', username: '', credential: null, permissions: { leads: true, website: false, landingPages: false } },
  { id: 'counselor-3', name: 'Counselor 3', username: '', credential: null, permissions: { leads: true, website: false, landingPages: false } },
];

export function readCounselors() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
    return DEFAULT_COUNSELORS.map((counselor) => {
      const match = Array.isArray(saved) && saved.find((item) => item.id === counselor.id);
      return {
        ...counselor,
        ...(match || {}),
        id: counselor.id,
        name: String(match?.name || counselor.name),
        username: String(match?.username || ''),
        credential: match?.credential || null,
        permissions: { ...counselor.permissions, ...(match?.permissions || {}) },
      };
    });
  } catch {
    return DEFAULT_COUNSELORS.map((counselor) => ({ ...counselor }));
  }
}

export function saveCounselors(counselors) {
  const saved = DEFAULT_COUNSELORS.map((counselor) => {
    const match = counselors.find((item) => item.id === counselor.id);
    return {
      ...counselor,
      ...match,
      id: counselor.id,
      name: String(match?.name || counselor.name).trim() || counselor.name,
      username: String(match?.username || ''),
      credential: match?.credential || null,
      permissions: { ...counselor.permissions, ...(match?.permissions || {}) },
    };
  });
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
