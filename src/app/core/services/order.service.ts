import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Order, OrderStatus } from '@core/models/store.models';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class OrderService {
  constructor(private readonly http: HttpClient) {}

  getForUser(userEmail: string): Observable<Order[]> {
    return this.http.get<Order[]>(`${environment.apiBaseUrl}/api/orders`, {
      params: { userEmail }
    });
  }

  create(order: Omit<Order, 'id' | 'date' | 'status' | 'trackingEvents'> & { userEmail: string }): Observable<Order> {
    return this.http.post<Order>(`${environment.apiBaseUrl}/api/orders`, order);
  }

  getAdminOrders(token: string): Observable<Order[]> {
    return this.http.get<Order[]>(`${environment.apiBaseUrl}/api/admin/orders`, {
      headers: new HttpHeaders({ Authorization: `Bearer ${token}` })
    });
  }

  updateStatus(orderId: string, status: OrderStatus, token: string, note = ''): Observable<Order> {
    return this.http.put<Order>(
      `${environment.apiBaseUrl}/api/admin/orders/${orderId}/status`,
      { status, note },
      { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) }
    );
  }
}
