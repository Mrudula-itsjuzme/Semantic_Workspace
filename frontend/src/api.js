// Central API client. Base URL comes from build-time env (VITE_API_BASE_URL)
// with a localhost fallback for dev.
export const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export function apiUrl(path) {
  if (path.startsWith('http')) return path;
  return `${API_BASE}${path}`;
}
