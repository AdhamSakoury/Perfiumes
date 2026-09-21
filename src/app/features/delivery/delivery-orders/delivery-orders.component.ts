import { DatePipe, NgClass } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Order } from '@core/models/store.models';
import { AuthService } from '@core/services/auth.service';
import { OrderService } from '@core/services/order.service';
import { ToastService } from '@core/services/toast.service';
import { ThemeService } from '@core/services/theme.service';
import { LocalizationService } from '@core/services/localization.service';
import { InvoiceService } from '@core/services/invoice.service';
import { OrderMapComponent } from '@shared/components/order-map/order-map.component';
import { OrderChatComponent } from '@shared/components/order-chat/order-chat.component';
import { EgpPipe } from '@shared/pipes/egp.pipe';
import { TranslatePipe } from '@shared/pipes/translate.pipe';
import { forkJoin, timeout } from 'rxjs';

@Component({
  selector: 'app-delivery-orders',
  standalone: true,
  imports: [
    DatePipe,
    NgClass,
    FormsModule,
    RouterLink,
    EgpPipe,
    TranslatePipe,
    OrderMapComponent,
    OrderChatComponent
  ],
  templateUrl: './delivery-orders.component.html',
  styleUrls: ['./delivery-orders.component.css']
})
export class DeliveryOrdersComponent {
  readonly orders = signal<Order[]>([]);
  readonly loading = signal(true);
  readonly activeMapOrder = signal<Order | null>(null);
  readonly activeChatOrder = signal<Order | null>(null);
  readonly search = signal('');
  readonly filter = signal<'all' | 'ready' | 'on-the-way' | 'delivered'>('all');
  private readonly ratingOrderId: string | null;

  // Computed counts
  readonly totalCount = computed(() => this.orders().length);
  readonly readyCount = computed(() => this.orders().filter((o) => !['OutForDelivery', 'Delivered', 'Cancelled'].includes(o.status)).length);
  readonly onTheWayCount = computed(() => this.orders().filter((o) => o.status === 'OutForDelivery').length);
  readonly deliveredCount = computed(() => this.orders().filter((o) => o.status === 'Delivered').length);

  readonly filteredOrders = computed(() => {
    const query = this.search().trim().toLowerCase();
    const selectedFilter = this.filter();

    return this.orders().filter((order) => {
      const matchesFilter =
        selectedFilter === 'all' ||
        (selectedFilter === 'ready' && !['OutForDelivery', 'Delivered', 'Cancelled'].includes(order.status)) ||
        (selectedFilter === 'on-the-way' && order.status === 'OutForDelivery') ||
        (selectedFilter === 'delivered' && order.status === 'Delivered');

      const searchableText = [
        order.id,
        order.shippingAddress?.name,
        order.shippingAddress?.phone,
        order.shippingAddress?.city,
        order.shippingAddress?.street
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return matchesFilter && (!query || searchableText.includes(query));
    });
  });

  updatingId: string | null = null;
  notes: Record<string, string> = {};
  customerRatings: Record<string, number> = {};
  customerRatingComments: Record<string, string> = {};
  ratingId: string | null = null;
  readonly ratedCustomerOrders = new Set<string>();
  customerRatingStatuses: Record<string, { rating: number; comment: string }> = {};
  deliveryRatingStatuses: Record<string, { rating: number; comment: string }> = {};

  get isAr(): boolean {
    return this.i18n.language() === 'ar';
  }

  constructor(
    private readonly auth: AuthService,
    private readonly ordersApi: OrderService,
    private readonly router: Router,
    private readonly toast: ToastService,
    private readonly sanitizer: DomSanitizer,
    readonly theme: ThemeService,
    private readonly i18n: LocalizationService,
    private readonly invoiceService: InvoiceService,
    route: ActivatedRoute
  ) {
    this.ratingOrderId = route.snapshot.queryParamMap.get('ratingOrderId');
    if (this.auth.currentUser()?.role !== 'delivery') {
      void this.router.navigateByUrl('/');
      return;
    }
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.auth.ensureAccessToken().pipe(timeout({ first: 10000 })).subscribe((token) => {
      if (!token) {
        void this.router.navigate(['/login'], { queryParams: { redirect: '/delivery/orders' } });
        return;
      }
      this.ordersApi.getDeliveryOrders(token).subscribe({
        next: (orders) => {
          this.orders.set(orders);
          const ratingOrder = this.ratingOrderId ? orders.find((order) => order.id === this.ratingOrderId) : undefined;
          if (ratingOrder) {
            this.filter.set('delivered');
            setTimeout(() => document.getElementById(`delivery-order-${ratingOrder.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
          }
          this.loading.set(false);
          this.loadCustomerRatings(orders, token);
        },
        error: () => {
          this.loading.set(false);
          this.toast.show(this.isAr ? 'تعذر تحميل الطلبات الموكلة إليك.' : 'Could not load assigned orders.', 'error');
        }
      });
    });
  }

  private loadCustomerRatings(orders: Order[], token: string): void {
    const delivered = orders.filter((order) => order.status === 'Delivered');
    if (!delivered.length) return;

    forkJoin(delivered.map((order) => this.ordersApi.getOrderRatings(order.id, token))).subscribe({
      next: (statuses) => {
        statuses.forEach((status, index) => {
          if (status.hasRatedDelivery && status.deliveryRating) {
            this.deliveryRatingStatuses[delivered[index].id] = {
              rating: status.deliveryRating,
              comment: status.deliveryComment || ''
            };
          }
          if (status.hasRatedCustomer && status.customerRating) {
            this.customerRatingStatuses[delivered[index].id] = {
              rating: status.customerRating,
              comment: status.customerComment || ''
            };
            this.ratedCustomerOrders.add(delivered[index].id);
          }
        });
      }
    });
  }

  setFilter(filter: 'all' | 'ready' | 'on-the-way' | 'delivered'): void {
    this.filter.set(filter);
  }

  statusLabel(status: Order['status']): string {
    if (status === 'Delivered') return this.isAr ? 'تم التسليم بنجاح' : 'Delivered';
    if (status === 'OutForDelivery') return this.isAr ? 'في الطريق للتسليم' : 'Out for delivery';
    return this.isAr ? 'جاهز للاستلام والتوصيل' : 'Ready to deliver';
  }

  statusClass(status: Order['status']): string {
    if (status === 'Delivered') return 'delivered';
    if (status === 'OutForDelivery') return 'on-the-way';
    return 'ready';
  }

  updateStatus(order: Order, status: 'OutForDelivery' | 'Delivered'): void {
    if (this.updatingId || order.status === status) return;
    this.updatingId = order.id;
    this.auth.ensureAccessToken().pipe(timeout({ first: 10000 })).subscribe((token) => {
      if (!token) return;
      this.ordersApi.updateDeliveryStatus(order.id, status, token, this.notes[order.id] || '').subscribe({
        next: (updated) => {
          this.orders.update((list) => list.map((item) => (item.id === updated.id ? updated : item)));
          if (this.activeMapOrder()?.id === updated.id) {
            this.activeMapOrder.set(updated);
          }
          this.notes[order.id] = '';
          this.updatingId = null;
          this.toast.show(
            status === 'Delivered'
              ? (this.isAr ? 'تم تأكيد تسليم الشحنة للعميل بنجاح.' : 'Order marked as delivered.')
              : (this.isAr ? 'تم تغيير الحالة إلى في الطريق للعميل.' : 'Order marked as out for delivery.'),
            'success'
          );
        },
        error: (error) => {
          this.updatingId = null;
          this.toast.show(error?.error?.message || (this.isAr ? 'تعذر تحديث الطلب.' : 'Could not update order.'), 'error');
        }
      });
    });
  }

  submitCustomerRating(order: Order): void {
    const rating = this.customerRatings[order.id] || 0;
    if (this.ratingId || rating < 1) return;

    this.ratingId = order.id;
    this.auth.ensureAccessToken().pipe(timeout({ first: 10000 })).subscribe((token) => {
      if (!token) {
        this.ratingId = null;
        this.toast.show(this.isAr ? 'انتهت الجلسة. سجل الدخول مرة أخرى.' : 'Your session expired. Please sign in again.', 'error');
        return;
      }
      this.ordersApi.submitCustomerRating(order.id, rating, this.customerRatingComments[order.id] || '', token)
        .pipe(timeout({ first: 10000 }))
        .subscribe({
        next: () => {
          this.ratingId = null;
          this.ratedCustomerOrders.add(order.id);
          this.customerRatingStatuses[order.id] = {
            rating,
            comment: this.customerRatingComments[order.id] || ''
          };
          this.toast.show(this.isAr ? 'تم إرسال تقييم العميل.' : 'Customer rating sent.', 'success');
        },
        error: (error) => {
          this.ratingId = null;
          this.toast.show(error?.error?.message || (this.isAr ? 'تعذر إرسال التقييم.' : 'Could not send rating.'), 'error');
        }
        });
    }, () => {
      this.ratingId = null;
      this.toast.show(this.isAr ? 'تعذر التحقق من تسجيل الدخول.' : 'Could not verify your session.', 'error');
    });
  }

  selectCustomerRating(orderId: string, rating: number): void {
    if (this.ratingId !== orderId) {
      this.customerRatings[orderId] = rating;
    }
  }

  onLocationUpdated(order: Order, coords: { latitude: number; longitude: number }): void {
    this.auth.ensureAccessToken().subscribe((token) => {
      if (!token) return;
      this.ordersApi.updateDeliveryLocation(order.id, coords.latitude, coords.longitude, token).subscribe({
        next: (updated) => {
          this.orders.update((list) => list.map((item) => (item.id === updated.id ? updated : item)));
        }
      });
    });
  }

  downloadInvoice(order: Order, event?: Event): void {
    if (event) event.stopPropagation();
    this.invoiceService.downloadInvoice(order, {
      fullName: order.shippingAddress?.name,
      email: order.userEmail,
      phone: order.shippingAddress?.phone
    });
    this.toast.show(
      this.isAr ? 'جارٍ تحضير الفاتورة كـ PDF...' : 'Preparing invoice PDF for customer...',
      'success'
    );
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

  cashDue(order: Order): number {
    if (order.paymentStatus === 'paid') return 0;
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

  routeUrl(order: Order): string {
    const address = order.shippingAddress;
    const destination = [address.street, address.city, address.state, address.country].filter(Boolean).join(', ');
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
  }

  mapUrl(order: Order): SafeResourceUrl {
    const address = order.shippingAddress;
    const destination = [address.street, address.city, address.state, address.country].filter(Boolean).join(', ');
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
  }
}
