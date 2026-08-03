import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, effect, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Order } from '@core/models/store.models';
import { AuthService } from '@core/services/auth.service';
import { CartService } from '@core/services/cart.service';
import { ScrollLockService } from '@core/services/scroll-lock.service';
import { ToastService } from '@core/services/toast.service';

@Component({
  selector: 'app-orders-page',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, FormsModule, RouterLink],
  templateUrl: './orders.component.html',
  styleUrl: './orders.component.css'
})
export class OrdersPageComponent {
  filter = signal('all');
  sort = signal('newest');
  query = signal('');
  selectedOrder = signal<Order | null>(null);
  readonly orders = computed(() => {
    const all = [...(this.auth.currentUser()?.orders || [])];
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
    private readonly toast: ToastService,
    private readonly scrollLock: ScrollLockService
  ) {
    effect((onCleanup) => {
      if (!this.selectedOrder()) return;
      this.scrollLock.lock();
      onCleanup(() => this.scrollLock.unlock());
    });
  }

  count(status: string): number {
    const orders = this.auth.currentUser()?.orders || [];
    return status === 'all' ? orders.length : orders.filter((order) => order.status.toLowerCase() === status).length;
  }

  reorder(order: Order): void {
    for (const item of order.items) this.cart.add(item.id, item.quantity);
    this.selectedOrder.set(null);
    this.toast.show('Items added to cart!');
  }
}

