import { Component, computed, signal } from '@angular/core';
import { DatePipe, NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Order } from '@core/models/store.models';
import { AuthService } from '@core/services/auth.service';
import { OrderService } from '@core/services/order.service';
import { ThemeService } from '@core/services/theme.service';
import { LocalizationService } from '@core/services/localization.service';
import { ToastService } from '@core/services/toast.service';
import { InvoiceService } from '@core/services/invoice.service';
import { EgpPipe } from '@shared/pipes/egp.pipe';
import { TranslatePipe } from '@shared/pipes/translate.pipe';
import { OrderMapComponent } from '@shared/components/order-map/order-map.component';
import { OrderChatComponent } from '@shared/components/order-chat/order-chat.component';

export interface AreaGroup {
  city: string;
  count: number;
  percentage: number;
}

export interface HourlySlot {
  timeLabel: string;
  count: number;
  heightPercent: number;
}

@Component({
  selector: 'app-delivery-dashboard',
  standalone: true,
  imports: [
    RouterLink,
    NgClass,
    FormsModule,
    EgpPipe,
    TranslatePipe,
    OrderMapComponent,
    OrderChatComponent
  ],
  templateUrl: './delivery-dashboard.component.html',
  styleUrl: './delivery-dashboard.component.css'
})
export class DeliveryDashboardComponent {
  readonly orders = signal<Order[]>([]);
  readonly loading = signal(true);
  readonly filter = signal<'all' | 'ready' | 'on-the-way' | 'delivered'>('all');
  readonly updatingId = signal<string | null>(null);

  readonly activeMapOrder = signal<Order | null>(null);
  readonly activeChatOrder = signal<Order | null>(null);

  // Core metrics
  readonly totalAssigned = computed(() => this.orders().length);
  readonly outForDelivery = computed(() => this.orders().filter((o) => o.status === 'OutForDelivery').length);
  readonly delivered = computed(() => this.orders().filter((o) => o.status === 'Delivered').length);
  readonly pending = computed(() => this.orders().filter((o) => !['OutForDelivery', 'Delivered', 'Cancelled'].includes(o.status)).length);
  readonly cancelled = computed(() => this.orders().filter((o) => o.status === 'Cancelled').length);

  readonly completionRate = computed(() => {
    const total = this.totalAssigned();
    if (total === 0) return 0;
    return Math.round((this.delivered() / total) * 100);
  });

  // Cash and financials
  readonly cashToCollect = computed(() => {
    return this.orders()
      .filter((o) => o.status !== 'Cancelled' && o.status !== 'Delivered' && o.paymentStatus !== 'paid')
      .reduce((sum, o) => sum + this.cashDue(o), 0);
  });

  readonly cashCollectedSoFar = computed(() => {
    return this.orders()
      .filter((o) => o.status === 'Delivered')
      .reduce((sum, o) => sum + this.cashDue(o, true), 0);
  });

  readonly prepaidTotal = computed(() => {
    return this.orders()
      .reduce((sum, o) => sum + (o.onlinePaymentAmount || 0), 0);
  });

  readonly totalRouteValue = computed(() => {
    return this.orders().reduce((sum, o) => sum + o.total, 0);
  });

  readonly prepaidPercentage = computed(() => {
    const total = this.totalRouteValue();
    if (total === 0) return 0;
    return Math.round((this.prepaidTotal() / total) * 100);
  });

  // Filtered orders list for the dashboard stops
  readonly filteredOrders = computed(() => {
    const list = this.orders();
    const f = this.filter();
    if (f === 'ready') return list.filter((o) => !['OutForDelivery', 'Delivered', 'Cancelled'].includes(o.status));
    if (f === 'on-the-way') return list.filter((o) => o.status === 'OutForDelivery');
    if (f === 'delivered') return list.filter((o) => o.status === 'Delivered');
    return list;
  });

  // Area distribution
  readonly areaGroups = computed<AreaGroup[]>(() => {
    const list = this.orders();
    if (!list.length) return [];
    const counts: Record<string, number> = {};
    for (const o of list) {
      const city = o.shippingAddress?.city?.trim() || 'Other';
      counts[city] = (counts[city] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([city, count]) => ({
        city,
        count,
        percentage: Math.round((count / list.length) * 100)
      }))
      .sort((a, b) => b.count - a.count);
  });

  // Donut SVG circumference calculation (r = 40 => circumference = 2 * PI * 40 = 251.32)
  readonly donutCircumference = 251.32;

  readonly donutDeliveredOffset = computed(() => {
    const total = this.totalAssigned();
    if (total === 0) return this.donutCircumference;
    const ratio = this.delivered() / total;
    return this.donutCircumference * (1 - ratio);
  });

  readonly donutOnTheWayStrokeDasharray = computed(() => {
    const total = this.totalAssigned();
    if (total === 0) return `0 ${this.donutCircumference}`;
    const len = (this.outForDelivery() / total) * this.donutCircumference;
    return `${len} ${this.donutCircumference}`;
  });

  readonly donutOnTheWayOffset = computed(() => {
    const total = this.totalAssigned();
    if (total === 0) return 0;
    const prevRatio = this.delivered() / total;
    return -(prevRatio * this.donutCircumference);
  });

  readonly donutPendingStrokeDasharray = computed(() => {
    const total = this.totalAssigned();
    if (total === 0) return `0 ${this.donutCircumference}`;
    const len = (this.pending() / total) * this.donutCircumference;
    return `${len} ${this.donutCircumference}`;
  });

  readonly donutPendingOffset = computed(() => {
    const total = this.totalAssigned();
    if (total === 0) return 0;
    const prevRatio = (this.delivered() + this.outForDelivery()) / total;
    return -(prevRatio * this.donutCircumference);
  });

  // Hourly velocity chart bars
  readonly hourlySlots = computed<HourlySlot[]>(() => {
    const slots: { label: string; count: number }[] = [
      { label: '09:00', count: 0 },
      { label: '11:00', count: 0 },
      { label: '13:00', count: 0 },
      { label: '15:00', count: 0 },
      { label: '17:00', count: 0 },
      { label: '19:00', count: 0 }
    ];

    const all = this.orders();
    if (all.length > 0) {
      all.forEach((o, i) => {
        const slotIdx = i % slots.length;
        slots[slotIdx].count += 1;
      });
    }

    const maxCount = Math.max(...slots.map((s) => s.count), 1);
    return slots.map((s) => ({
      timeLabel: s.label,
      count: s.count,
      heightPercent: Math.max(15, Math.round((s.count / maxCount) * 100))
    }));
  });

  get courierName(): string {
    const u = this.auth.currentUser();
    return u?.fullName || u?.name || 'Courier';
  }

  get isAr(): boolean {
    return this.i18n.language() === 'ar';
  }

  constructor(
    readonly auth: AuthService,
    private readonly ordersApi: OrderService,
    private readonly router: Router,
    readonly theme: ThemeService,
    private readonly i18n: LocalizationService,
    private readonly toast: ToastService,
    private readonly invoiceService: InvoiceService
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
        void this.router.navigate(['/login'], { queryParams: { redirect: '/delivery' } });
        return;
      }
      this.ordersApi.getDeliveryOrders(token).subscribe({
        next: (orders) => {
          this.orders.set(orders);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.toast.show(this.isAr ? 'فشل تحميل خط السير' : 'Could not load delivery route.', 'error');
        }
      });
    });
  }

  updateStatus(order: Order, status: 'OutForDelivery' | 'Delivered'): void {
    if (this.updatingId() || order.status === status) return;
    this.updatingId.set(order.id);

    this.auth.ensureAccessToken().subscribe((token) => {
      if (!token) {
        this.updatingId.set(null);
        return;
      }
      this.ordersApi.updateDeliveryStatus(order.id, status, token, '').subscribe({
        next: (updated) => {
          this.orders.update((list) => list.map((item) => (item.id === updated.id ? updated : item)));
          this.updatingId.set(null);
          this.toast.show(
            status === 'Delivered'
              ? (this.isAr ? 'تم تأكيد تسليم الطلب بنجاح!' : 'Order delivered successfully!')
              : (this.isAr ? 'تم بدء رحلة التوصيل وفي الطريق للعميل' : 'Order marked as out for delivery.'),
            'success'
          );
        },
        error: (err) => {
          this.updatingId.set(null);
          this.toast.show(err?.error?.message || (this.isAr ? 'تعذر تحديث الحالة' : 'Could not update status'), 'error');
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

  downloadInvoice(order: Order, event?: Event): void {
    if (event) event.stopPropagation();
    this.invoiceService.downloadInvoice(order, {
      fullName: order.shippingAddress?.name,
      email: order.userEmail,
      phone: order.shippingAddress?.phone
    });
    this.toast.show(
      this.isAr ? 'جارٍ تحضير الفاتورة كـ PDF' : 'Preparing invoice PDF for customer...',
      'success'
    );
  }

  cashDue(order: Order, collected = false): number {
    if (!collected && order.paymentStatus === 'paid') return 0;
    if (typeof order.amountDueAtDelivery === 'number') return order.amountDueAtDelivery;
    if (order.paymentMethod === 'cashOnDelivery') return order.total;
    return order.shippingFee || 0;
  }

  cleanPhone(phone?: string | null): string {
    if (!phone) return '';
    return phone.replace(/[^\d+]/g, '');
  }

  getGoogleNavUrl(order: Order): string {
    if (order.customerLatitude && order.customerLongitude) {
      return `https://www.google.com/maps/dir/?api=1&destination=${order.customerLatitude},${order.customerLongitude}`;
    }
    const dest = [order.shippingAddress?.street, order.shippingAddress?.city, 'Egypt'].filter(Boolean).join(', ');
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
  }

  statusLabel(status: Order['status']): string {
    if (status === 'Delivered') return this.isAr ? 'تم التسليم' : 'Delivered';
    if (status === 'OutForDelivery') return this.isAr ? 'في الطريق' : 'Out for delivery';
    return this.isAr ? 'جاهز للاستلام' : 'Ready to start';
  }
}
