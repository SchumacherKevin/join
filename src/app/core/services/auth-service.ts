import { computed, Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from './api.service';
import { TaskService } from './task.service';
import { ContactService } from './contact.service';
import {
  AuthUser,
  clearSession,
  getStoredUser,
  getToken,
  sessionExpired$,
  storeSession,
  storeUser,
} from './auth-token';

/** Response of POST /auth/login. */
interface LoginResponse {
  token: string;
  user: AuthUser;
}

/**
 * Service managing user authentication, active session state, and user profile data.
 */
@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private api = inject(ApiService);
  private router = inject(Router);
  private taskService = inject(TaskService);
  private contactService = inject(ContactService);

  /** Signal indicating whether a user is currently authenticated. */
  isLoggedIn = signal(!!getToken());

  /** Signal holding the current user's display name. */
  userName = signal<string>(this.resolveUserName(getToken() ? getStoredUser() : null));

  /** Computed signal returning up to two initials derived from the user's display name. */
  userInitials = computed(() => {
    const name = this.userName();

    if (!name || name === 'Guest User') {
      return 'GU';
    }

    if (name === 'Guest') {
      return 'G';
    }

    return name
      .trim()
      .split(' ')
      .filter(Boolean)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  });

  constructor() {
    this.checkSession();

    sessionExpired$.subscribe(() => {
      clearSession();
      this.setUserData(null);
      this.clearCaches();
      this.router.navigateByUrl('/login');
    });
  }

  /**
   * Validates a stored token with the backend and updates application state.
   */
  async checkSession(): Promise<void> {
    if (!getToken()) {
      this.setUserData(null);
      return;
    }

    try {
      const user = await this.api.get<AuthUser>('auth/me');
      storeUser(user);
      this.setUserData(user);
    } catch (error) {
      // A 401 is handled by the interceptor (session expired); keep the session on network errors.
      console.error('Error checking session:', error);
    }
  }

  /**
   * Authenticates a user with email and password credentials.
   *
   * @param email User email address.
   * @param password User password.
   */
  async login(email: string, password: string): Promise<void> {
    const { token, user } = await this.api.post<LoginResponse>('auth/login', { email, password });

    this.clearCaches();
    storeSession(token, user);
    this.setUserData(user);
  }

  /**
   * Signs out the currently authenticated user and clears local service caches.
   */
  async logout(): Promise<void> {
    try {
      await this.api.post('auth/logout');
    } catch (error) {
      // The token may already be invalid; the local session is cleared regardless.
      console.error('Error during logout:', error);
    }

    clearSession();
    this.setUserData(null);
    this.clearCaches();
  }

  /**
   * Clears cached data in dependent services.
   */
  clearCaches(): void {
    this.taskService.clearCache();
    this.contactService.clearCache();
  }

  /**
   * Fetches the current authenticated user from the backend.
   *
   * @returns User object or null if unauthenticated.
   */
  async getCurrentUser(): Promise<AuthUser | null> {
    if (!getToken()) return null;

    try {
      return await this.api.get<AuthUser>('auth/me');
    } catch {
      return null;
    }
  }

  /**
   * Resolves the display name of the current authenticated user.
   *
   * @returns Resolved display name string.
   */
  async getUserName(): Promise<string> {
    const user = await this.getCurrentUser();

    return this.resolveUserName(user);
  }

  /**
   * Registers a new user account; the backend also adds the user to the contacts.
   * Throws Error('EMAIL_EXISTS') if the email address is already registered.
   *
   * @param email User email.
   * @param password User password.
   * @param name Full name of the new user.
   */
  async signUp(email: string, password: string, name: string): Promise<void> {
    await this.api.post('auth/signup', { email: email.trim(), password, name: name.trim() });
    this.contactService.clearCache();
  }

  /**
   * Updates internal signals for login state and user name based on the user session.
   *
   * @param user Signed-in user or null.
   */
  private setUserData(user: AuthUser | null): void {
    this.isLoggedIn.set(!!user);
    this.userName.set(this.resolveUserName(user));
  }

  /**
   * Resolves a user's display name, with guest fallbacks.
   *
   * @param user Signed-in user or null.
   * @returns Formatted name string.
   */
  private resolveUserName(user: AuthUser | null): string {
    if (!user) return 'Guest User';

    if (user.email === 'guest@guest.com') return 'Guest';

    return user.name || 'User';
  }
}
