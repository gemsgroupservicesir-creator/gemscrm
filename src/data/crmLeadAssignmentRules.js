import { crmCache, crmRequest, readCache, refreshCrmData, subscribeToCache } from './crmApi.js';

export function readLeadAssignmentRules() { return readCache('leadAssignmentRules'); }
export function subscribeToLeadAssignmentRules(callback) { return subscribeToCache('leadAssignmentRules', callback); }

export async function saveLeadAssignmentRules(rules) {
  const result = await crmRequest('lead-assignment-rules-save', { rules });
  crmCache.leadAssignmentRules = result.rules || [];
  window.dispatchEvent(new CustomEvent('gems-crm-lead-assignment-rules-updated', { detail: crmCache.leadAssignmentRules }));
  await refreshCrmData();
  return readLeadAssignmentRules();
}

export async function applyLeadAssignmentRules() {
  const result = await crmRequest('lead-assignment-apply', {});
  await refreshCrmData();
  return result;
}
