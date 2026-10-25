import { crmCache, crmRequest, readCache, refreshCrmData, subscribeToCache } from './crmApi.js';

export const DEFAULT_COUNSELORS = [];

export function readCounselors() { return readCache('counselors'); }
export function subscribeToCounselors(callback) { return subscribeToCache('counselors', callback); }

export async function saveCounselors(counselors) {
  const normalized = counselors.filter((item) => item?.id).map((item) => ({
    id: String(item.id), name: String(item.name || 'Counselor').trim() || 'Counselor',
    permissions: { leads: item.permissions?.leads === true, website: item.permissions?.website === true, landingPages: item.permissions?.landingPages === true },
  }));
  await crmRequest('counselors-save', { counselors: normalized });
  await refreshCrmData();
  return readCache('counselors');
}

export async function updateCounselor(id, changes) {
  const current = readCounselors();
  await saveCounselors(current.map((item) => item.id === id ? { ...item, ...changes, permissions: { ...item.permissions, ...(changes.permissions || {}) } } : item));
  return readCounselors().find((item) => item.id === id);
}
