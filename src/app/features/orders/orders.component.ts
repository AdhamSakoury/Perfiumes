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
import { CustomDropdownComponent, CustomDropdownOption } from '@shared/components/custom-dropdown/custom-dropdown.component';
import { TranslatePipe } from '@shared/pipes/translate.pipe';
import { OrderMapComponent } from '@shared/components/order-map/order-map.component';
import { OrderChatComponent } from '@shared/components/order-chat/order-chat.component';
import { OrderRatingModalComponent } from '@shared/components/order-rating-modal/order-rating-modal.component';

@Component({
  selector: 'app-orders-page',
  standalone: true,
  imports: [
    CurrencyPipe,
    DatePipe,
    FormsModule,
    RouterLink,
    CustomDropdownComponent,
    TranslatePipe,
    OrderMapComponent,
    OrderChatComponent,
    OrderRatingModalComponent
  ],
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
  cancellingOrderId: string | null = null;

  readonly activeMapOrder = signal<Order | null>(null);
  readonly activeChatOrder = signal<Order | null>(null);
  readonly activeRatingOrder = signal<Order | null>(null);

  readonly trackingSteps = ['Processing', 'Packed', 'ReadyForPickup', 'Shipped', 'OutForDelivery', 'Delivered'];
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

  get sortOptions(): CustomDropdownOption[] {
    return [
      { value: 'newest', label: this.i18n.t('newest'), icon: 'fa-arrow-down-wide-short' },
      { value: 'oldest', label: this.i18n.t('oldest'), icon: 'fa-arrow-up-wide-short' },
      { value: 'highest', label: this.i18n.t('highestTotal'), icon: 'fa-arrow-trend-up' },
      { value: 'lowest', label: this.i18n.t('lowestTotal'), icon: 'fa-arrow-trend-down' }
    ];
  }

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

  canCancel(order: Order): boolean {
    return order.status === 'Processing' || order.status === 'OnHold' || order.status === 'Packed';
  }

  cancelOrder(order: Order): void {
    if (!this.canCancel(order) || this.cancellingOrderId) return;
    if (!window.confirm('Cancel this order? Paid orders are refunded to your wallet.')) return;

    this.cancellingOrderId = order.id;
    this.auth.ensureAccessToken().subscribe((token) => {
      if (!token) {
        this.cancellingOrderId = null;
        this.toast.show('Please login again to cancel this order.', 'error');
        return;
      }

      this.orderService.cancel(order.id, token).subscribe({
        next: (updated) => {
          const orders = this.userOrders().map((item) => item.id === updated.id ? updated : item);
          this.userOrders.set(orders);
          this.selectedOrder.set(updated);
          const user = this.auth.currentUser();
          if (user) this.auth.updateCurrentUser({ ...user, orders });
          this.cancellingOrderId = null;
          this.toast.show(updated.paymentStatus === 'refunded' ? 'Order cancelled. The refund was added to your wallet.' : 'Order cancelled.', 'success');
        },
        error: (error) => {
          this.cancellingOrderId = null;
          this.toast.show(error?.error?.message || 'Could not cancel this order.', 'error');
        }
      });
    });
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
      OnHold: 'On hold',
      Packed: 'Packed',
      ReadyForPickup: 'Ready for pickup',
      Shipped: 'Shipped',
      OutForDelivery: 'Out for delivery',
      Delivered: 'Delivered',
      Cancelled: 'Cancelled'
    };
    return labels[status] || status;
  }

  paymentLabel(order: Order): string {
    if (order.paymentMethod === 'wallet') return 'Wallet paid';
    if (order.paymentStatus === 'refunded') return 'Refunded to wallet';
    if (order.paymentMethod === 'card') return 'Card paid';
    if (order.paymentMethod === 'instapay') return order.paymentStatus === 'paid' ? 'InstaPay paid' : 'InstaPay pending';
    return 'Cash on delivery';
  }

  cleanPhone(phone?: string | null): string {
    if (!phone) return '';
    return phone.replace(/[^\d+]/g, '');
  }

  openMap(order: Order): void {
    this.activeMapOrder.set(order);
  }

  closeMap(): void {
    this.activeMapOrder.set(null);
  }

  openChat(order: Order): void {
    this.activeChatOrder.set(order);
  }

  closeChat(): void {
    this.activeChatOrder.set(null);
  }

  openRating(order: Order): void {
    this.activeRatingOrder.set(order);
  }

  closeRating(): void {
    this.activeRatingOrder.set(null);
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
