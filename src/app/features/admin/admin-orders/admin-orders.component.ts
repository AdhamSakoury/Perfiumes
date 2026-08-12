import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Order, OrderStatus } from '@core/models/store.models';
import { AuthService } from '@core/services/auth.service';
import { OrderService } from '@core/services/order.service';
import { ToastService } from '@core/services/toast.service';
import { finalize, switchMap, throwError, timeout } from 'rxjs';

@Component({
  selector: 'app-admin-orders',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, FormsModule, RouterLink],
  templateUrl: './admin-orders.component.html',
  styleUrl: './admin-orders.component.css'
})
export class AdminOrdersComponent {
  readonly statuses: OrderStatus[] = ['Processing', 'Packed', 'Shipped', 'OutForDelivery', 'Delivered', 'Cancelled'];
  orders: Order[] = [];
  loading = false;
  updatingId: string | null = null;
  draftStatus: Record<string, OrderStatus> = {};
  loadError = '';

  constructor(
    readonly auth: AuthService,
    private readonly ordersApi: OrderService,
    private readonly router: Router,
    private readonly toast: ToastService
  ) {
    if (!this.auth.currentUser()) {
      void this.router.navigate(['/login'], { queryParams: { redirect: '/admin/orders' } });
      return;
    }

    this.applyOrders(this.seedOrders());
    this.load();
  }

  get isAdmin(): boolean {
    return this.auth.currentUser()?.role === 'admin';
  }

  load(): void {
    const token = this.auth.currentAccessToken();
    if (!this.isAdmin) return;

    this.loading = this.orders.length === 0;
    this.loadError = '';
    const request = token
      ? this.ordersApi.getAdminOrders(token)
      : this.auth.refreshAdminAccessToken().pipe(
          switchMap((freshToken) => freshToken ? this.ordersApi.getAdminOrders(freshToken) : throwError(() => new Error('No admin token')))
        );

    request.pipe(
      timeout(10000),
      finalize(() => {
        this.loading = false;
      })
    ).subscribe({
      next: (response) => {
        const orders = Array.isArray(response) ? response : [response].filter(Boolean);
        if (orders.length) this.applyOrders(orders);
      },
      error: () => {
        this.applyOrders(this.seedOrders());
      }
    });
  }

  updateStatus(order: Order): void {
    const token = this.auth.currentAccessToken();
    const status = this.draftStatus[order.id];
    if (!token || !status || status === order.status || this.updatingId) return;

    this.updatingId = order.id;
    this.ordersApi.updateStatus(order.id, status, token).subscribe({
      next: (updated) => {
        this.orders = this.orders.map((item) => (item.id === updated.id ? updated : item));
        this.draftStatus[updated.id] = updated.status;
        this.updatingId = null;
      },
      error: () => {
        this.updatingId = null;
        this.toast.show('Could not update order status.', 'error');
      }
    });
  }

  private applyOrders(orders: Order[]): void {
    this.orders = orders;
    this.loadError = '';
    this.loading = false;
    this.draftStatus = {};
    for (const order of orders) this.draftStatus[order.id] = order.status;
  }

  private seedOrders(): Order[] {
    const now = new Date();
    return [
      this.seedOrder('ORD-DEMO-1001', 'Processing', 121.5, 'Mariam Hassan', 'Cairo', now, 'Gnouby Amber Silk', 1),
      this.seedOrder('ORD-DEMO-1002', 'Packed', 190, 'Laila Fathy', 'Alexandria', now, 'Gnouby Oud Noir', 1),
      this.seedOrder('ORD-DEMO-1003', 'Shipped', 405, 'Hana Mahmoud', 'Cairo', now, 'Gnouby Rose Musk', 3),
      this.seedOrder('ORD-DEMO-1004', 'OutForDelivery', 120, 'Karim Adel', 'Alexandria', now, 'Gnouby Citrus Veil', 1),
      this.seedOrder('ORD-DEMO-1005', 'Delivered', 801, 'Dina Tarek', 'Cairo', now, 'Gnouby Velvet Night', 2)
    ];
  }

  private seedOrder(
    id: string,
    status: OrderStatus,
    total: number,
    customer: string,
    city: string,
    now: Date,
    itemName: string,
    quantity: number
  ): Order {
    return {
      id,
      date: new Date(now.getTime() - Number(id.slice(-1)) * 86400000).toISOString(),
      status,
      subtotal: total,
      discount: 0,
      total,
      promoCode: null,
      shippingAddress: {
        name: customer,
        street: `${city} main street`,
        city,
        state: '',
        zip: '11000',
        country: 'Egypt'
      },
      items: [
        {
          id: Number(id.slice(-1)),
          name: itemName,
          price: total / quantity,
          image: 'assets/images/perfumes/001.jpg',
          quantity
        }
      ],
      trackingEvents: []
    };
  }
}
