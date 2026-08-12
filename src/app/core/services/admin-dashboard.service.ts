import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { AdminDashboardSummary, AdminWallet } from '@core/models/store.models';
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

  private authHeaders(token: string): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }
}
