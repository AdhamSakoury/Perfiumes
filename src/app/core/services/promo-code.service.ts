import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { PromoCode, PromoData } from '@core/models/store.models';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class PromoCodeService {
  constructor(private readonly http: HttpClient) {}

  validate(code: string): Observable<PromoData> {
    return this.http.post<PromoData>(`${environment.apiBaseUrl}/api/promos/validate`, { code });
  }

  getAdminPromos(token: string): Observable<PromoCode[]> {
    return this.http.get<PromoCode[]>(`${environment.apiBaseUrl}/api/admin/promos`, {
      headers: this.authHeaders(token)
    });
  }

  createAdminPromo(code: string, discountPercent: number, expiresAt: string, token: string): Observable<PromoCode> {
    return this.http.post<PromoCode>(
      `${environment.apiBaseUrl}/api/admin/promos`,
      { code, discountPercent, expiresAt },
      { headers: this.authHeaders(token) }
    );
  }

  private authHeaders(token: string): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }
}
