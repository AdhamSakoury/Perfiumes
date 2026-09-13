import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Order } from '@core/models/store.models';
import { AuthService } from '@core/services/auth.service';
import { OrderService } from '@core/services/order.service';
import { ToastService } from '@core/services/toast.service';
<<<<<<< HEAD
import { OrderMapComponent } from '@shared/components/order-map/order-map.component';
import { OrderChatComponent } from '@shared/components/order-chat/order-chat.component';
=======
import { ThemeService } from '@core/services/theme.service';
>>>>>>> e5832361bff973661e9d4eca45004cf0b39f3aba

@Component({
  selector: 'app-delivery-orders',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, FormsModule, OrderMapComponent, OrderChatComponent],
  templateUrl: './delivery-orders.component.html',
  styleUrls: ['./delivery-orders.component.css']
})
export class DeliveryOrdersComponent {
  readonly orders = signal<Order[]>([]);
  readonly loading = signal(true);
<<<<<<< HEAD
  readonly activeMapOrder = signal<Order | null>(null);
  readonly activeChatOrder = signal<Order | null>(null);

=======
  readonly search = signal('');
  readonly filter = signal<'all' | 'ready' | 'on-the-way' | 'delivered'>('all');
  readonly filteredOrders = computed(() => {
    const query = this.search().trim().toLowerCase();
    const selectedFilter = this.filter();

    return this.orders().filter((order) => {
      const matchesFilter = selectedFilter === 'all'
        || (selectedFilter === 'ready' && !['OutForDelivery', 'Delivered', 'Cancelled'].includes(order.status))
        || (selectedFilter === 'on-the-way' && order.status === 'OutForDelivery')
        || (selectedFilter === 'delivered' && order.status === 'Delivered');
      const searchableText = [
        order.id,
        order.shippingAddress.name,
        order.shippingAddress.phone,
        order.shippingAddress.city,
        order.shippingAddress.street
      ].filter(Boolean).join(' ').toLowerCase();

      return matchesFilter && (!query || searchableText.includes(query));
    });
  });
>>>>>>> e5832361bff973661e9d4eca45004cf0b39f3aba
  updatingId: string | null = null;
  notes: Record<string, string> = {};

  constructor(
    private readonly auth: AuthService,
    private readonly ordersApi: OrderService,
    private readonly router: Router,
    private readonly toast: ToastService,
    private readonly sanitizer: DomSanitizer,
    readonly theme: ThemeService
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

  setFilter(filter: 'all' | 'ready' | 'on-the-way' | 'delivered'): void {
    this.filter.set(filter);
  }

  statusLabel(status: Order['status']): string {
    if (status === 'Delivered') return 'Delivered';
    if (status === 'OutForDelivery') return 'Out for delivery';
    return 'Ready to deliver';
  }

  statusClass(status: Order['status']): string {
    if (status === 'Delivered') return 'delivered';
    if (status === 'OutForDelivery') return 'on-the-way';
    return 'ready';
  }

  updateStatus(order: Order, status: 'OutForDelivery' | 'Delivered'): void {
    if (this.updatingId || order.status === status) return;
    this.updatingId = order.id;
    this.auth.ensureAccessToken().subscribe((token) => {
      if (!token) return;
      this.ordersApi.updateDeliveryStatus(order.id, status, token, this.notes[order.id] || '').subscribe({
        next: (updated) => {
          this.orders.update((list) => list.map((item) => item.id === updated.id ? updated : item));
          if (this.activeMapOrder()?.id === updated.id) {
            this.activeMapOrder.set(updated);
          }
          this.notes[order.id] = '';
          this.updatingId = null;
          this.toast.show(status === 'Delivered' ? 'Order marked as delivered.' : 'Order marked as out for delivery.', 'success');
        },
        error: (error) => { this.updatingId = null; this.toast.show(error?.error?.message || 'Could not update order.', 'error'); }
      });
    });
  }

<<<<<<< HEAD
  onLocationUpdated(order: Order, coords: { latitude: number; longitude: number }): void {
    this.auth.ensureAccessToken().subscribe((token) => {
      if (!token) return;
      this.ordersApi.updateDeliveryLocation(order.id, coords.latitude, coords.longitude, token).subscribe({
        next: (updated) => {
          this.orders.update((list) => list.map((item) => item.id === updated.id ? updated : item));
        }
      });
    });
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

  cleanPhone(phone?: string | null): string {
    if (!phone) return '';
    return phone.replace(/[^\d+]/g, '');
  }

  getGoogleNavUrl(order: Order): string {
    const lat = order.customerLatitude ?? 30.0444;
    const lng = order.customerLongitude ?? 31.2357;
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
=======
  routeUrl(order: Order): string {
    const address = order.shippingAddress;
    const destination = [address.street, address.city, address.state, address.country]
      .filter(Boolean)
      .join(', ');
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
  }

  mapUrl(order: Order): SafeResourceUrl {
    const address = order.shippingAddress;
    const destination = [address.street, address.city, address.state, address.country]
      .filter(Boolean)
      .join(', ');
    return this.sanitizer.bypassSecurityTrustResourceUrl(
      `https://www.google.com/maps?q=${encodeURIComponent(destination)}&output=embed`
    );
  }

  phoneUrl(order: Order): string | null {
    const phone = order.shippingAddress.phone?.replace(/[^+\d]/g, '') || '';
    return phone ? `tel:${phone}` : null;
  }

  smsUrl(order: Order): string | null {
    const phone = order.shippingAddress.phone?.replace(/[^+\d]/g, '') || '';
    return phone ? `sms:${phone}` : null;
>>>>>>> e5832361bff973661e9d4eca45004cf0b39f3aba
  }
}
