import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Order, OrderStatus } from '@core/models/store.models';
import { Observable, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class OrderService {
  constructor(private readonly http: HttpClient) {}

  getForUser(userEmail: string): Observable<Order[]> {
    return this.http.get<Order[]>(`${environment.apiBaseUrl}/api/orders`, {
      params: { userEmail }
    });
  }

  getById(orderId: string): Observable<Order> {
    return this.http.get<Order>(`${environment.apiBaseUrl}/api/orders/${orderId}`);
  }

  create(order: Omit<Order, 'id' | 'date' | 'status' | 'trackingEvents'> & { userEmail: string }, token?: string): Observable<Order> {
    const options = token ? { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) } : {};
    return this.http
      .post<Order>(`${environment.apiBaseUrl}/api/orders`, order, options)
      .pipe(timeout(10_000));
  }

  cancel(orderId: string, token: string): Observable<Order> {
    return this.http.post<Order>(`${environment.apiBaseUrl}/api/orders/${orderId}/cancel`, {}, {
      headers: new HttpHeaders({ Authorization: `Bearer ${token}` })
    });
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

  assignDelivery(orderId: string, deliveryUserId: string, token: string): Observable<Order> {
    return this.http.post<Order>(
      `${environment.apiBaseUrl}/api/admin/orders/${orderId}/assign-delivery`,
      { deliveryUserId },
      { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) }
    );
  }

  getDeliveryOrders(token: string): Observable<Order[]> {
    return this.http.get<Order[]>(`${environment.apiBaseUrl}/api/delivery/orders`, {
      headers: new HttpHeaders({ Authorization: `Bearer ${token}` })
    });
  }

  updateDeliveryStatus(orderId: string, status: 'OutForDelivery' | 'Delivered', token: string, note = ''): Observable<Order> {
    return this.http.put<Order>(
      `${environment.apiBaseUrl}/api/delivery/orders/${orderId}/status`,
      { status, note },
      { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) }
    );
  }
}
