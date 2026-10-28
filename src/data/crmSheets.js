import { refreshCrmData } from './crmApi.js';

export async function syncGoogleSheetLeads() {
  const response = await fetch('/api/google-sheets-sync', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  let result = {};
  try { result = await response.json(); } catch { /* Show a clear fallback below. */ }
  if (!response.ok) throw new Error(result.error || 'Could not sync leads from Google Sheets.');
  await refreshCrmData();
  return result;
}
