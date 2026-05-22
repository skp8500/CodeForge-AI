import { api } from './api';

const ACCESS_TOKEN_KEY = 'cf_access_token';
const LEGACY_ACCESS_TOKEN_KEY = 'accessToken';
const USER_KEY = 'cf_user';

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY) ?? localStorage.getItem(LEGACY_ACCESS_TOKEN_KEY);
}

export function setAccessToken(token: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
  localStorage.setItem(LEGACY_ACCESS_TOKEN_KEY, token);
}

export function clearAuth(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(LEGACY_ACCESS_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getUser() {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function setUser(user: object): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export async function refreshAccessToken(): Promise<string | null> {
  try {
    const res = await api.post<{ accessToken: string }>('/auth/refresh', {});
    setAccessToken(res.accessToken);
    return res.accessToken;
  } catch {
    clearAuth();
    return null;
  }
}
