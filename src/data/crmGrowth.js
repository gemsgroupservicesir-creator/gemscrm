import { crmCache, crmRequest, refreshCrmData, subscribeToCache } from './crmApi.js';

export function readGrowthTasks() { return crmCache.growthTasks; }
export function subscribeToGrowthTasks(callback) { return subscribeToCache('growthTasks', callback); }
export function readGrowthFeatures() { return crmCache.growthFeatures; }
export function subscribeToGrowthFeatures(callback) { return subscribeToCache('growthFeatures', callback); }

export async function saveGrowthTask(task) {
  const result = await crmRequest('growth-task-save', { task });
  await refreshCrmData();
  return result.task;
}

export async function deleteGrowthTask(id) {
  await crmRequest('growth-task-delete', { id });
  await refreshCrmData();
}

export async function saveGrowthFeature(id, value) {
  const result = await crmRequest('growth-feature-save', { id, value });
  crmCache.growthFeatures = { ...crmCache.growthFeatures, [id]: result.value };
  window.dispatchEvent(new CustomEvent('gems-crm-growth-features-updated', { detail: crmCache.growthFeatures }));
  return result.value;
}
