import { safeAppUrl } from './safeUrl.js';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

export function appUrl(value = '/') {
  return safeAppUrl(value, basePath);
}

export function appPath(pathname = '/') {
  if (basePath && (pathname === basePath || pathname.startsWith(`${basePath}/`))) {
    return pathname.slice(basePath.length) || '/';
  }
  return pathname;
}
