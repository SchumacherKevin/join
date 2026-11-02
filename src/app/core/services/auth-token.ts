import { Subject } from 'rxjs';

/**
 * Stores the API token and the signed-in user in localStorage.
 *
 * Kept outside AuthService so the HTTP interceptor can read the token without
 * creating a circular dependency (AuthService → HttpClient → interceptor).
 */

const TOKEN_KEY = 'join_token';
const USER_KEY = 'join_user';

/** The user as returned by the backend's /auth/login and /auth/me endpoints. */
export interface AuthUser {
  id: number;
  email: string;
  name: string;
}

/** Emits when the backend rejects the stored token (expired or logged out elsewhere). */
export const sessionExpired$ = new Subject<void>();

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function storeSession(token: string, user: AuthUser): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // Storage unavailable (e.g. private mode): the session lasts until reload.
  }
}

export function storeUser(user: AuthUser): void {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // Ignore, see storeSession.
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    // Ignore, see storeSession.
  }
}
