import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, effect, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Order } from '@core/models/store.models';
import { AuthService } from '@core/services/auth.service';
import { CartService } from '@core/services/cart.service';
import { OrderService } from '@core/services/order.service';
import { ScrollLockService } from '@core/services/scroll-lock.service';
import { ToastService } from '@core/services/toast.service';
import { LocalizationService } from '@core/services/localization.service';
import { TranslatePipe } from '@shared/pipes/translate.pipe';

@Component({
  selector: 'app-orders-page',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, FormsModule, RouterLink, TranslatePipe],
  templateUrl: './orders.component.html',
  styleUrl: './orders.component.css'
})
export class OrdersPageComponent {
  filter = signal('all');
  sort = signal('newest');
  query = signal('');
  loading = signal(false);
  userOrders = signal<Order[]>([]);
  selectedOrder = signal<Order | null>(null);
  readonly trackingSteps = ['Processing', 'Packed', 'Shipped', 'OutForDelivery', 'Delivered'];
  private requestedEmail: string | null = null;
  readonly orders = computed(() => {
    const all = [...this.userOrders()];
    const status = this.filter();
    const query = this.query().trim().toLowerCase();
    let result = status === 'all' ? all : all.filter((order) => order.status.toLowerCase() === status);
    if (query) {
      result = result.filter((order) => order.id.toLowerCase().includes(query) || order.items.some((item) => item.name.toLowerCase().includes(query)));
    }
    switch (this.sort()) {
      case 'oldest':
        return result.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
      case 'highest':
        return result.sort((a, b) => b.total - a.total);
      case 'lowest':
        return result.sort((a, b) => a.total - b.total);
      default:
        return result.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
    }
  });

  constructor(
    readonly auth: AuthService,
    private readonly cart: CartService,
    private readonly orderService: OrderService,
    private readonly toast: ToastService,
    private readonly scrollLock: ScrollLockService,
    private readonly i18n: LocalizationService
  ) {
    effect((onCleanup) => {
      if (!this.selectedOrder()) return;
      this.scrollLock.lock();
      onCleanup(() => this.scrollLock.unlock());
    });

    effect(() => {
      const user = this.auth.currentUser();
      if (!user) {
        this.userOrders.set([]);
        return;
      }

      const cachedOrders = user.orders || [];
      const email = user.email.toLowerCase();
      this.userOrders.set(cachedOrders);
      if (this.requestedEmail === email) return;

      this.requestedEmail = email;
      this.loadOrders(email, cachedOrders.length === 0);
    });
  }

  count(status: string): number {
    const orders = this.userOrders();
    return status === 'all' ? orders.length : orders.filter((order) => order.status.toLowerCase() === status).length;
  }

  reorder(order: Order): void {
    for (const item of order.items) this.cart.add(item.id, item.quantity);
    this.selectedOrder.set(null);
    this.toast.show(this.i18n.t('itemsAddedToCart'));
  }

  statusLabel(status: string): string {
    return this.i18n.t(`status_${status.toLowerCase()}`);
  }

  trackingIndex(order: Order): number {
    if (order.status === 'Cancelled') return -1;
    return Math.max(0, this.trackingSteps.indexOf(order.status));
  }

  trackingPercent(order: Order): number {
    const index = this.trackingIndex(order);
    if (index < 0) return 100;
    return (index / (this.trackingSteps.length - 1)) * 100;
  }

  trackingTitle(status: string): string {
    const labels: Record<string, string> = {
      Processing: 'Confirmed',
      Packed: 'Packed',
      Shipped: 'Shipped',
      OutForDelivery: 'Out for delivery',
      Delivered: 'Delivered',
      Cancelled: 'Cancelled'
    };
    return labels[status] || status;
  }

  private loadOrders(userEmail: string, showBusy: boolean): void {
    this.loading.set(showBusy);
    this.orderService.getForUser(userEmail).subscribe({
      next: (orders) => {
        this.userOrders.set(orders);
        const user = this.auth.currentUser();
        if (user) this.auth.updateCurrentUser({ ...user, orders });
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        if (showBusy || !this.userOrders().length) this.toast.show('Could not load orders.', 'error');
      }
    });
  }
}

