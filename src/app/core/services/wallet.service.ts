import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { UserWallet } from '@core/models/store.models';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface WalletTopUpCheckoutResponse {
  topUpId: string;
  amount: number;
  currency: string;
  clientSecret: string;
  checkoutUrl: string;
}

export interface WalletTopUpConfirmResponse {
  status: string;
  wallet?: UserWallet;
}

export interface WalletTopUpStatusResponse {
  id: string;
  amount: number;
  currency: string;
  status: string;
  paymentProvider: string;
  providerTransactionId?: string;
  createdAt: string;
  completedAt?: string;
}

@Injectable({ providedIn: 'root' })
export class WalletService {
  constructor(private readonly http: HttpClient) {}

  getCurrentWallet(token: string): Observable<UserWallet> {
    return this.http.get<UserWallet>(`${environment.apiBaseUrl}/api/wallet`, {
      headers: new HttpHeaders({ Authorization: `Bearer ${token}` })
    });
  }

  initiatePaymobTopUp(token: string, amount: number): Observable<WalletTopUpCheckoutResponse> {
    return this.http.post<WalletTopUpCheckoutResponse>(
      `${environment.apiBaseUrl}/api/payments/paymob/wallet-top-up`,
      { amount },
      { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) }
    );
  }

  confirmPaymobTopUp(token: string, topUpId: string, transactionId?: string): Observable<WalletTopUpConfirmResponse> {
    return this.http.post<WalletTopUpConfirmResponse>(
      `${environment.apiBaseUrl}/api/payments/paymob/wallet-top-up/${encodeURIComponent(topUpId)}/confirm`,
      { transactionId },
      { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) }
    );
  }

  getTopUpStatus(token: string, topUpId: string): Observable<WalletTopUpStatusResponse> {
    return this.http.get<WalletTopUpStatusResponse>(
      `${environment.apiBaseUrl}/api/payments/paymob/wallet-top-up/${encodeURIComponent(topUpId)}`,
      { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) }
    );
  }
}
