import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface PaymobCheckoutResponse {
  orderId: string;
  clientSecret: string;
  checkoutUrl: string;
}

@Injectable({ providedIn: 'root' })
export class PaymentService {
  constructor(private readonly http: HttpClient) {}

  createPaymobCheckout(orderId: string): Observable<PaymobCheckoutResponse> {
    return this.http.post<PaymobCheckoutResponse>(`${environment.apiBaseUrl}/api/payments/paymob/checkout`, { orderId });
  }
}
