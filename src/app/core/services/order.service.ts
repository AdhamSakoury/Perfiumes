import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { CustomerRating, DeliveryRating, Order, OrderConversation, OrderMessage, OrderRatingsStatus, OrderStatus, ProductReview } from '@core/models/store.models';
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

  updateDeliveryLocation(orderId: string, latitude: number, longitude: number, token: string): Observable<Order> {
    return this.http.post<Order>(
      `${environment.apiBaseUrl}/api/delivery/orders/${orderId}/location`,
      { latitude, longitude },
      { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) }
    );
  }

  getOrderMessages(orderId: string, token: string): Observable<OrderMessage[]> {
    return this.http.get<OrderMessage[]>(
      `${environment.apiBaseUrl}/api/orders/${orderId}/messages`,
      { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) }
    );
  }

  sendOrderMessage(orderId: string, message: string, token: string): Observable<OrderMessage> {
    return this.http.post<OrderMessage>(
      `${environment.apiBaseUrl}/api/orders/${orderId}/messages`,
      { message },
      { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) }
    );
  }

  sendOrderMedia(orderId: string, file: File, messageType: 'image' | 'audio' | 'document', token: string): Observable<OrderMessage> {
    const body = new FormData();
    body.append('file', file, file.name);
    body.append('messageType', messageType);
    return this.http.post<OrderMessage>(
      `${environment.apiBaseUrl}/api/orders/${orderId}/messages/media`,
      body,
      { headers: new HttpHeaders({ Authorization: 'Bearer ' + token }) }
    );
  }

  getOrderConversations(token: string): Observable<OrderConversation[]> {
    return this.http.get<OrderConversation[]>(
      `${environment.apiBaseUrl}/api/messages/orders`,
      { headers: new HttpHeaders({ Authorization: 'Bearer ' + token }) }
    );
  }

  getOrderRatings(orderId: string, token: string): Observable<OrderRatingsStatus> {
    return this.http.get<OrderRatingsStatus>(
      `${environment.apiBaseUrl}/api/orders/${orderId}/ratings`,
      { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) }
    );
  }

  submitProductReview(orderId: string, productId: number, rating: number, comment: string, token: string): Observable<ProductReview> {
    return this.http.post<ProductReview>(
      `${environment.apiBaseUrl}/api/orders/${orderId}/product-reviews`,
      { productId, rating, comment },
      { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) }
    );
  }

  submitDeliveryRating(orderId: string, rating: number, comment: string, token: string): Observable<DeliveryRating> {
    return this.http.post<DeliveryRating>(
      `${environment.apiBaseUrl}/api/orders/${orderId}/delivery-rating`,
      { rating, comment },
      { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) }
    );
  }

  submitCustomerRating(orderId: string, rating: number, comment: string, token: string): Observable<CustomerRating> {
    return this.http.post<CustomerRating>(
      `${environment.apiBaseUrl}/api/delivery/orders/${orderId}/customer-rating`,
      { rating, comment },
      { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) }
    );
  }

  getProductReviews(productId: number): Observable<ProductReview[]> {
    return this.http.get<ProductReview[]>(`${environment.apiBaseUrl}/api/products/${productId}/reviews`);
  }
}
