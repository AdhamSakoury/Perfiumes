import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { AdminDashboardSummary, AdminUser, AdminWallet, AdminWalletTransaction } from '@core/models/store.models';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AdminDashboardService {
  constructor(private readonly http: HttpClient) {}

  getSummary(token: string): Observable<AdminDashboardSummary> {
    return this.http.get<AdminDashboardSummary>(`${environment.apiBaseUrl}/api/admin/dashboard`, {
      headers: this.authHeaders(token)
    });
  }

  getDemoSummary(): Observable<AdminDashboardSummary> {
    return this.http.get<AdminDashboardSummary>(`${environment.apiBaseUrl}/api/admin/dashboard/demo`);
  }

  getWallets(token: string): Observable<AdminWallet[]> {
    return this.http.get<AdminWallet[]>(`${environment.apiBaseUrl}/api/admin/wallets`, {
      headers: this.authHeaders(token)
    });
  }

  adjustWallet(walletId: string, amount: number, type: 'credit' | 'debit', reason: string, token: string): Observable<AdminWallet> {
    return this.http.post<AdminWallet>(
      `${environment.apiBaseUrl}/api/admin/wallets/${walletId}/adjust`,
      { amount, type, reason, referenceId: null },
      { headers: this.authHeaders(token) }
    );
  }

  getUsers(token: string): Observable<AdminUser[]> {
    return this.http.get<AdminUser[]>(`${environment.apiBaseUrl}/api/admin/users`, {
      headers: this.authHeaders(token)
    });
  }

  toggleBlockUser(userId: string, isBlocked: boolean, reason: string, token: string): Observable<AdminUser> {
    return this.http.post<AdminUser>(
      `${environment.apiBaseUrl}/api/admin/users/${userId}/toggle-block`,
      { isBlocked, reason },
      { headers: this.authHeaders(token) }
    );
  }

  getCustomerWalletTransactions(token: string): Observable<AdminWalletTransaction[]> {
    return this.http.get<AdminWalletTransaction[]>(`${environment.apiBaseUrl}/api/admin/wallet-transactions/customer`, {
      headers: this.authHeaders(token)
    });
  }

  createDelivery(
    details: { fullName: string; email: string; password: string; phone: string; address: string },
    token: string
  ): Observable<AdminUser> {
    return this.http.post<AdminUser>(`${environment.apiBaseUrl}/api/admin/deliveries`, details, {
      headers: this.authHeaders(token)
    });
  }

  deleteUser(userId: string, token: string): Observable<void> {
    return this.http.delete<void>(`${environment.apiBaseUrl}/api/admin/users/${userId}`, {
      headers: this.authHeaders(token)
    });
  }

  private authHeaders(token: string): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }
}
