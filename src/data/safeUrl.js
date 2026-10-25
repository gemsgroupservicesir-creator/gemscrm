export function safeAppUrl(value, basePath = '') {
  if (typeof value !== 'string') return '/';
  const safeValue = value.trim();
  if (!safeValue) return '/';
  if (safeValue.startsWith('#')) return safeValue;
  if (/^(?:https:\/\/|mailto:|tel:)/i.test(safeValue)) return safeValue;
  if (/^data:image\/(?:jpeg|png|webp|gif);base64,/i.test(safeValue)) return safeValue;
  if (/^[a-z][a-z\d+.-]*:/i.test(safeValue) || safeValue.startsWith('//')) return '/';

  const normalized = safeValue.startsWith('/') ? safeValue : `/${safeValue}`;
  const base = String(basePath || '').replace(/\/$/, '');
  if (!base || normalized === base || normalized.startsWith(`${base}/`)) return normalized;
  return `${base}${normalized}`;
}
