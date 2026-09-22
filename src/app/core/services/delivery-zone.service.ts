import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { CheckoutQuote, DeliveryZone, DetectedLocationResult, OrderItem, UpsertDeliveryZone } from '@core/models/store.models';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class DeliveryZoneService {
  constructor(private readonly http: HttpClient) {}

  getActive(): Observable<DeliveryZone[]> {
    return this.http.get<DeliveryZone[]>(`${environment.apiBaseUrl}/api/delivery-zones`);
  }

  detectLocation(latitude?: number, longitude?: number, address?: string, language?: string): Observable<DetectedLocationResult> {
    return this.http.post<DetectedLocationResult>(`${environment.apiBaseUrl}/api/delivery-zones/detect-location`, {
      latitude,
      longitude,
      address,
      language
    });
  }

  getAdminZones(token: string): Observable<DeliveryZone[]> {
    return this.http.get<DeliveryZone[]>(`${environment.apiBaseUrl}/api/admin/delivery-zones`, {
      headers: this.authHeaders(token)
    });
  }

  create(payload: UpsertDeliveryZone, token: string): Observable<DeliveryZone> {
    return this.http.post<DeliveryZone>(`${environment.apiBaseUrl}/api/admin/delivery-zones`, payload, {
      headers: this.authHeaders(token)
    });
  }

  update(id: string, payload: UpsertDeliveryZone, token: string): Observable<DeliveryZone> {
    return this.http.put<DeliveryZone>(`${environment.apiBaseUrl}/api/admin/delivery-zones/${id}`, payload, {
      headers: this.authHeaders(token)
    });
  }

  delete(id: string, token: string): Observable<void> {
    return this.http.delete<void>(`${environment.apiBaseUrl}/api/admin/delivery-zones/${id}`, {
      headers: this.authHeaders(token)
    });
  }

  quote(
    items: OrderItem[],
    promoCode: string | null,
    deliveryZoneId: string,
    deliveryAreaId: string | null,
    paymentMethod: string,
    token: string
  ): Observable<CheckoutQuote> {
    return this.http.post<CheckoutQuote>(`${environment.apiBaseUrl}/api/checkout/quote`, {
      items,
      promoCode,
      deliveryZoneId,
      deliveryAreaId,
      paymentMethod
    }, { headers: this.authHeaders(token) });
  }

  private authHeaders(token: string): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }
}
