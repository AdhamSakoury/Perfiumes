import { Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthResult, User } from '@core/models/store.models';
import { StorageService } from './storage.service';

const AUTH_KEY = 'gnouby_auth';
const USERS_KEY = 'gnouby_users';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly currentUser = signal<User | null>(null);

  constructor(private readonly storage: StorageService, private readonly router: Router) {
    this.currentUser.set(this.readCurrentUser());
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
      updatedAt: now
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

  updateCurrentUser(user: User): void {
    const updated = { ...user, updatedAt: new Date().toISOString() };
    this.saveUser(updated);
    this.setCurrentUser(updated, true);
  }

  logout(): void {
    this.storage.remove(AUTH_KEY);
    this.storage.removeSession(AUTH_KEY);
    this.currentUser.set(null);
    void this.router.navigateByUrl('/');
  }

  private setCurrentUser(user: User, remember: boolean): void {
    this.storage.set(AUTH_KEY, user);
    if (remember) this.storage.setSession(AUTH_KEY, user);
    this.currentUser.set(user);
  }

  private readCurrentUser(): User | null {
    const stored = this.storage.get<User | null>(AUTH_KEY, null) || this.storage.getSession<User | null>(AUTH_KEY, null);
    if (!stored) return null;
    const latest = this.users().find((user) => user.id === stored.id || user.email.toLowerCase() === stored.email.toLowerCase());
    return latest || stored;
  }
}

