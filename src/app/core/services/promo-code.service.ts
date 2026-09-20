import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { PromoCode, PromoData } from '@core/models/store.models';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class PromoCodeService {
  readonly promos = signal<PromoCode[]>([]);

  constructor(private readonly http: HttpClient) {}

  validate(code: string): Observable<PromoData> {
    return this.http.post<PromoData>(`${environment.apiBaseUrl}/api/promos/validate`, { code });
  }

  getAdminPromos(token: string): Observable<PromoCode[]> {
    return this.http.get<PromoCode[]>(`${environment.apiBaseUrl}/api/admin/promos`, {
      headers: this.authHeaders(token)
    }).pipe(
      tap((items) => this.promos.set(items))
    );
  }

  createAdminPromo(code: string, discountPercent: number, expiresAt: string, token: string): Observable<PromoCode> {
    return this.http.post<PromoCode>(
      `${environment.apiBaseUrl}/api/admin/promos`,
      { code, discountPercent, expiresAt },
      { headers: this.authHeaders(token) }
    ).pipe(
      tap((created) => {
        this.promos.update((list) => [created, ...list.filter((item) => item.id !== created.id)]);
      })
    );
  }

  private authHeaders(token: string): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }
}
