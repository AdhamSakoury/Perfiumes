import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Order } from '@core/models/store.models';
import { AuthService } from '@core/services/auth.service';
import { OrderService } from '@core/services/order.service';
import { ToastService } from '@core/services/toast.service';

@Component({
  selector: 'app-delivery-orders',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, FormsModule],
  templateUrl: './delivery-orders.component.html',
  styleUrl: './delivery-orders.component.css'
})
export class DeliveryOrdersComponent {
  readonly orders = signal<Order[]>([]);
  readonly loading = signal(true);
  updatingId: string | null = null;
  notes: Record<string, string> = {};

  constructor(
    private readonly auth: AuthService,
    private readonly ordersApi: OrderService,
    private readonly router: Router,
    private readonly toast: ToastService
  ) {
    if (this.auth.currentUser()?.role !== 'delivery') {
      void this.router.navigateByUrl('/');
      return;
    }
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.auth.ensureAccessToken().subscribe((token) => {
      if (!token) {
        void this.router.navigate(['/login'], { queryParams: { redirect: '/delivery/orders' } });
        return;
      }
      this.ordersApi.getDeliveryOrders(token).subscribe({
        next: (orders) => { this.orders.set(orders); this.loading.set(false); },
        error: () => { this.loading.set(false); this.toast.show('Could not load assigned orders.', 'error'); }
      });
    });
  }

  updateStatus(order: Order, status: 'OutForDelivery' | 'Delivered'): void {
    if (this.updatingId || order.status === status) return;
    this.updatingId = order.id;
    this.auth.ensureAccessToken().subscribe((token) => {
      if (!token) return;
      this.ordersApi.updateDeliveryStatus(order.id, status, token, this.notes[order.id] || '').subscribe({
        next: (updated) => {
          this.orders.update((list) => list.map((item) => item.id === updated.id ? updated : item));
          this.notes[order.id] = '';
          this.updatingId = null;
          this.toast.show(status === 'Delivered' ? 'Order marked as delivered.' : 'Order marked as out for delivery.', 'success');
        },
        error: (error) => { this.updatingId = null; this.toast.show(error?.error?.message || 'Could not update order.', 'error'); }
      });
    });
  }
}
