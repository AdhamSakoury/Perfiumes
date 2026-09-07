import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface PaymobCheckoutResponse {
  orderId: string;
  clientSecret: string;
  checkoutUrl: string;
}

export interface PaymentGatewayAvailability {
  configured: boolean;
  message: string | null;
}

@Injectable({ providedIn: 'root' })
export class PaymentService {
  constructor(private readonly http: HttpClient) {}

  createPaymobCheckout(orderId: string, token: string): Observable<PaymobCheckoutResponse> {
    return this.http
      .post<PaymobCheckoutResponse>(
        `${environment.apiBaseUrl}/api/payments/paymob/checkout`,
        { orderId },
        { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) }
      )
      .pipe(timeout(18_000));
  }

  paymobAvailability(): Observable<PaymentGatewayAvailability> {
    return this.http
      .get<PaymentGatewayAvailability>(`${environment.apiBaseUrl}/api/payments/paymob/availability`)
      .pipe(timeout(3_000));
  }
}
