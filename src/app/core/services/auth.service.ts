import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthResult, User } from '@core/models/store.models';
import { StorageService } from './storage.service';
import { map, Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';

const AUTH_KEY = 'gnouby_auth';
const AUTH_TOKEN_KEY = 'gnouby_auth_token';
const USERS_KEY = 'gnouby_users';

const TEST_USERS: User[] = [
  {
    id: 'test_admin',
    fullName: 'Ganouby Admin',
    name: 'Ganouby Admin',
    email: 'admin@ganouby.local',
    password: 'Admin123!',
    phone: '+20 100 000 0001',
    address: 'Ganouby HQ, Cairo',
    profilePhoto: null,
    orders: [],
    wishlist: [1, 5, 21],
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
    authProvider: 'local',
    role: 'admin'
  },
  {
    id: 'test_customer_1',
    fullName: 'Mariam Hassan',
    name: 'Mariam Hassan',
    email: 'mariam@test.local',
    password: 'Test123!',
    phone: '+20 100 000 0002',
    address: 'Zamalek, Cairo',
    profilePhoto: null,
    orders: [],
    wishlist: [3, 8, 48],
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
    authProvider: 'local',
    role: 'customer'
  },
  {
    id: 'test_customer_2',
    fullName: 'Omar Saleh',
    name: 'Omar Saleh',
    email: 'omar@test.local',
    password: 'Test123!',
    phone: '+20 100 000 0003',
    address: 'Maadi, Cairo',
    profilePhoto: null,
    orders: [],
    wishlist: [2, 9, 24],
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
    authProvider: 'local',
    role: 'customer'
  }
];

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
    this.seedTestUsers();
    this.currentUser.set(this.readCurrentUser());
    this.currentAccessToken.set(this.readCurrentAccessToken());
  }

  users(): User[] {
    return this.storage.get<User[]>(USERS_KEY, []);
  }

  saveUser(user: User): void {
    const users = this.users();
    const index = users.findIndex((stored) => stored.id === user.id || stored.email.toLowerCase() === user.email.toLowerCase());
    if (index >= 0) {
      users[index] = { ...users[index], ...user, password: user.password || users[index].password };
    } else {
      users.push(user);
    }
    this.storage.set(USERS_KEY, users);
  }

  register(fullName: string, email: string, password: string, phone = '', address = ''): AuthResult {
    const users = this.users();
    if (users.some((user) => user.email.toLowerCase() === email.toLowerCase())) {
      return { success: false, message: 'Email already registered' };
    }

    const now = new Date().toISOString();
    const user: User = {
      id: `user_${Date.now()}`,
      fullName,
      name: fullName,
      email: email.toLowerCase(),
      password,
      phone,
      address,
      profilePhoto: null,
      orders: [],
      wishlist: [],
      createdAt: now,
      updatedAt: now,
      authProvider: 'local',
      role: 'customer'
    };

    users.push(user);
    this.storage.set(USERS_KEY, users);
    this.setCurrentUser(user, true);
    return { success: true, user };
  }

  login(email: string, password: string, remember = true): AuthResult {
    const user = this.users().find((stored) => stored.email.toLowerCase() === email.toLowerCase());
    if (!user) return { success: false, message: 'Email not found' };
    if (user.password !== password) return { success: false, message: 'Incorrect password' };

    this.setCurrentUser(user, remember);
    return { success: true, user };
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

  loginWithGoogle(credential: string, remember = true): Observable<AuthResult> {
    return this.http.post<GoogleLoginResponse>(`${environment.apiBaseUrl}/api/auth/google`, { credential }).pipe(
      map((response) => {
        const now = new Date().toISOString();
        const existing = this.users().find((user) => user.id === response.user.id || user.email.toLowerCase() === response.user.email.toLowerCase());
        const user: User = {
          id: response.user.id,
          fullName: response.user.fullName,
          name: response.user.fullName,
          email: response.user.email.toLowerCase(),
          password: existing?.password || '',
          phone: existing?.phone || '',
          address: existing?.address || '',
          profilePhoto: response.user.profilePhoto,
          orders: existing?.orders || [],
          wishlist: existing?.wishlist || [],
          createdAt: existing?.createdAt || now,
          updatedAt: now,
          authProvider: 'google',
          role: response.user.role
        };

        return { success: true, user, accessToken: response.accessToken };
      }),
      tap((result) => {
        if (result.user && result.accessToken) {
          this.saveUser(result.user);
          this.setCurrentUser(result.user, remember, result.accessToken);
        }
      })
    );
  }

  updateCurrentUser(user: User): void {
    const updated = { ...user, updatedAt: new Date().toISOString() };
    this.saveUser(updated);
    this.setCurrentUser(updated, true);
  }

  deleteCurrentUser(): void {
    const user = this.currentUser();
    if (!user) return;

    const users = this.users().filter((stored) => stored.id !== user.id && stored.email.toLowerCase() !== user.email.toLowerCase());
    this.storage.set(USERS_KEY, users);
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
    if (!stored) return null;
    const latest = this.users().find((user) => user.id === stored.id || user.email.toLowerCase() === stored.email.toLowerCase());
    return latest || stored;
  }

  private readCurrentAccessToken(): string | null {
    return this.storage.get<string | null>(AUTH_TOKEN_KEY, null) || this.storage.getSession<string | null>(AUTH_TOKEN_KEY, null);
  }

  private seedTestUsers(): void {
    const users = this.users();
    let changed = false;

    for (const testUser of TEST_USERS) {
      const index = users.findIndex((user) => user.email.toLowerCase() === testUser.email.toLowerCase());
      if (index < 0) {
        users.push(testUser);
        changed = true;
      } else {
        users[index] = {
          ...testUser,
          ...users[index],
          id: testUser.id,
          fullName: users[index].fullName || testUser.fullName,
          name: users[index].name || testUser.name,
          password: testUser.password,
          authProvider: 'local',
          role: testUser.role,
          wishlist: users[index].wishlist?.length ? users[index].wishlist : testUser.wishlist,
          orders: users[index].orders || testUser.orders,
          updatedAt: new Date().toISOString()
        };
        changed = true;
      }
    }

    if (changed) {
      this.storage.set(USERS_KEY, users);
    }
  }
}

