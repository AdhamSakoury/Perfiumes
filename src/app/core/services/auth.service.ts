import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthResult, User } from '@core/models/store.models';
import { StorageService } from './storage.service';
import { catchError, map, Observable, of, tap } from 'rxjs';
import { environment } from '../../../environments/environment';

const AUTH_KEY = 'gnouby_auth';
const AUTH_TOKEN_KEY = 'gnouby_auth_token';

interface GoogleLoginResponse {
  accessToken: string;
  tokenType: string;
  expiresAt: string;
  user: {
    id: string;
    fullName: string;
    email: string;
    profilePhoto: string | null;
    role: 'customer' | 'admin';
    phone: string;
    address: string;
    createdAt: string;
    updatedAt: string;
  };
}

interface AdminLoginResponse {
  accessToken: string;
  tokenType: string;
  expiresAt: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly currentUser = signal<User | null>(null);
  readonly currentAccessToken = signal<string | null>(null);

  constructor(
    private readonly storage: StorageService,
    private readonly router: Router,
    private readonly http: HttpClient
  ) {
    this.currentUser.set(this.readCurrentUser());
    this.currentAccessToken.set(this.readCurrentAccessToken());
  }

  users(): User[] {
    const current = this.currentUser();
    return current ? [current] : [];
  }

  saveUser(user: User): void {
    this.setCurrentUser(user, true, this.currentAccessToken() || undefined);
  }

  register(fullName: string, email: string, password: string, phone = '', address = ''): Observable<AuthResult> {
    return this.http.post<GoogleLoginResponse>(`${environment.apiBaseUrl}/api/auth/register`, { fullName, email, password, phone, address }).pipe(
      map((response) => this.responseToAuthResult(response, password)),
      tap((result) => {
        if (result.user && result.accessToken) this.setCurrentUser(result.user, true, result.accessToken);
      })
    );
  }

  login(email: string, password: string, remember = true): Observable<AuthResult> {
    return this.http.post<GoogleLoginResponse>(`${environment.apiBaseUrl}/api/auth/login`, { email, password }).pipe(
      map((response) => this.responseToAuthResult(response, password)),
      tap((result) => {
        if (result.user && result.accessToken) this.setCurrentUser(result.user, remember, result.accessToken);
      })
    );
  }

  loginAdminApi(email: string, password: string): Observable<string> {
    return this.http.post<AdminLoginResponse>(`${environment.apiBaseUrl}/api/admin/login`, { email, password }).pipe(
      map((response) => response.accessToken),
      tap((token) => {
        this.storage.set(AUTH_TOKEN_KEY, token);
        this.storage.setSession(AUTH_TOKEN_KEY, token);
        this.currentAccessToken.set(token);
      })
    );
  }

  refreshAdminAccessToken(): Observable<string | null> {
    const user = this.currentUser();
    const password = this.adminRefreshPassword();
    if (user?.role !== 'admin' || !password) return of(null);

    return this.loginAdminApi(user.email, password).pipe(
      map((token) => token || null),
      catchError(() => of(null))
    );
  }

  loginWithGoogle(credential: string, remember = true): Observable<AuthResult> {
    return this.http.post<GoogleLoginResponse>(`${environment.apiBaseUrl}/api/auth/google`, { credential }).pipe(
      map((response) => {
        return this.responseToAuthResult(response, '');
      }),
      tap((result) => {
        if (result.user && result.accessToken) {
          this.setCurrentUser(result.user, remember, result.accessToken);
        }
      })
    );
  }

  updateCurrentUser(user: User): void {
    const updated = { ...user, updatedAt: new Date().toISOString() };
    this.setCurrentUser(updated, true, this.currentAccessToken() || undefined);
  }

  updateProfile(user: User, currentPassword = '', newPassword = ''): Observable<AuthResult> {
    const token = this.currentAccessToken();
    if (!token) return of({ success: false, message: 'Please login again' });

    return this.http.put<GoogleLoginResponse>(
      `${environment.apiBaseUrl}/api/auth/profile`,
      {
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        address: user.address,
        currentPassword,
        newPassword
      },
      { headers: { Authorization: `Bearer ${token}` } }
    ).pipe(
      map((response) => this.responseToAuthResult(response, newPassword || user.password)),
      tap((result) => {
        if (result.user && result.accessToken) this.setCurrentUser(result.user, true, result.accessToken);
      })
    );
  }

  deleteCurrentUser(): void {
    const user = this.currentUser();
    if (!user) return;

    this.logout();
  }

  logout(): void {
    this.storage.remove(AUTH_KEY);
    this.storage.removeSession(AUTH_KEY);
    this.storage.remove(AUTH_TOKEN_KEY);
    this.storage.removeSession(AUTH_TOKEN_KEY);
    this.currentUser.set(null);
    this.currentAccessToken.set(null);
    void this.router.navigateByUrl('/');
  }

  private setCurrentUser(user: User, remember: boolean, accessToken?: string): void {
    this.storage.set(AUTH_KEY, user);
    if (accessToken) this.storage.set(AUTH_TOKEN_KEY, accessToken);
    if (remember) {
      this.storage.setSession(AUTH_KEY, user);
      if (accessToken) this.storage.setSession(AUTH_TOKEN_KEY, accessToken);
    }
    this.currentUser.set(user);
    if (accessToken) this.currentAccessToken.set(accessToken);
  }

  private readCurrentUser(): User | null {
    const stored = this.storage.get<User | null>(AUTH_KEY, null) || this.storage.getSession<User | null>(AUTH_KEY, null);
    return stored;
  }

  private readCurrentAccessToken(): string | null {
    return this.storage.get<string | null>(AUTH_TOKEN_KEY, null) || this.storage.getSession<string | null>(AUTH_TOKEN_KEY, null);
  }

  private adminRefreshPassword(): string | null {
    const user = this.currentUser();
    if (user?.password) return user.password;
    if (!environment.production && user?.email?.toLowerCase() === 'admin@ganouby.local') return 'Admin123!';
    return null;
  }

  private responseToAuthResult(response: GoogleLoginResponse, password: string): AuthResult {
    return {
      success: true,
      accessToken: response.accessToken,
      user: {
        id: response.user.id,
        fullName: response.user.fullName,
        name: response.user.fullName,
        email: response.user.email.toLowerCase(),
        password,
        phone: response.user.phone || '',
        address: response.user.address || '',
        profilePhoto: response.user.profilePhoto,
        orders: [],
        wishlist: [],
        createdAt: response.user.createdAt || new Date().toISOString(),
        updatedAt: response.user.updatedAt || new Date().toISOString(),
        authProvider: password ? 'local' : 'google',
        role: response.user.role
      }
    };
  }
}

