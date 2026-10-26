import { crmRequest, readCache, refreshCrmData, subscribeToCache } from './crmApi.js';

export function readDailyReports() { return readCache('dailyReports'); }
export function subscribeToDailyReports(callback) { return subscribeToCache('dailyReports', callback); }

export async function saveDailyWorkReport(report) {
  const result = await crmRequest('daily-report-save', { report });
  await refreshCrmData();
  return result.report;
}
