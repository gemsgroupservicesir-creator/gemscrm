const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

export function appUrl(value = '/') {
  if (typeof value !== 'string' || !value) return value;
  if (/^(?:[a-z]+:|\/\/|#)/i.test(value)) return value;
  const normalized = value.startsWith('/') ? value : `/${value}`;
  if (!basePath || normalized === basePath || normalized.startsWith(`${basePath}/`)) return normalized;
  return `${basePath}${normalized}`;
}

export function appPath(pathname = '/') {
  if (basePath && (pathname === basePath || pathname.startsWith(`${basePath}/`))) {
    return pathname.slice(basePath.length) || '/';
  }
  return pathname;
}
