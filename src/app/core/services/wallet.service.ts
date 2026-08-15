import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { UserWallet } from '@core/models/store.models';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class WalletService {
  constructor(private readonly http: HttpClient) {}

  getCurrentWallet(token: string): Observable<UserWallet> {
    return this.http.get<UserWallet>(`${environment.apiBaseUrl}/api/wallet`, {
      headers: new HttpHeaders({ Authorization: `Bearer ${token}` })
    });
  }

  topUpCurrentWallet(token: string, amount: number, reason = 'Wallet top up'): Observable<UserWallet> {
    return this.http.post<UserWallet>(
      `${environment.apiBaseUrl}/api/wallet/top-up`,
      { amount, reason },
      { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) }
    );
  }
}
