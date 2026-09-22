import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { ParamMap } from '@angular/router';
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

export interface WalletTopUpConfirmPayload {
  topUpId?: string;
  transactionId?: string;
  success?: boolean;
  amountCents?: number;
  merchantOrderId?: string;
  paymobOrderId?: string;
  pending?: boolean;
}

export interface WalletTopUpConfirmResponse {
  status: string;
  kind?: string;
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

export function paymobConfirmPayloadFromParams(params: ParamMap): WalletTopUpConfirmPayload {
  const amountRaw = params.get('amount_cents');
  const amountCents = amountRaw ? Number(amountRaw) : NaN;
  const successRaw = params.get('success');
  const pendingRaw = params.get('pending');

  return {
    topUpId: params.get('topUpId')
      || params.get('merchant_order_id')
      || params.get('special_reference')
      || undefined,
    transactionId: params.get('id') || undefined,
    success: successRaw == null ? undefined : successRaw.toLowerCase() === 'true',
    amountCents: Number.isFinite(amountCents) ? amountCents : undefined,
    merchantOrderId: params.get('merchant_order_id') || undefined,
    paymobOrderId: params.get('order') || params.get('order_id') || undefined,
    pending: pendingRaw == null ? undefined : pendingRaw.toLowerCase() === 'true'
  };
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
    return this.confirmPaymobTopUpReturn(token, { topUpId, transactionId });
  }

  confirmPaymobTopUpReturn(
    token: string,
    payload: WalletTopUpConfirmPayload
  ): Observable<WalletTopUpConfirmResponse> {
    return this.http.post<WalletTopUpConfirmResponse>(
      `${environment.apiBaseUrl}/api/payments/paymob/wallet-top-up/confirm-return`,
      payload,
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
