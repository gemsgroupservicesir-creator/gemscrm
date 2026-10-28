import { refreshCrmData } from './crmApi.js';

export async function syncGoogleSheetLeads(spreadsheetUrl = '') {
  const response = await fetch('/api/google-sheets-sync', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', ...(spreadsheetUrl ? { 'Content-Type': 'application/json' } : {}) },
    body: spreadsheetUrl ? JSON.stringify({ spreadsheetUrl }) : undefined,
    cache: 'no-store',
  });
  let result = {};
  try { result = await response.json(); } catch { /* Show a clear fallback below. */ }
  if (!response.ok) throw new Error(result.error || 'Could not sync leads from Google Sheets.');
  await refreshCrmData();
  return result;
}
