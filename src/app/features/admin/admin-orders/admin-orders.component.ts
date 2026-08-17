import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Order, OrderStatus } from '@core/models/store.models';
import { AuthService } from '@core/services/auth.service';
import { LocalizationService } from '@core/services/localization.service';
import { OrderService } from '@core/services/order.service';
import { ToastService } from '@core/services/toast.service';
import { CustomDropdownComponent, CustomDropdownOption } from '@shared/components/custom-dropdown/custom-dropdown.component';
import { TranslatePipe } from '@shared/pipes/translate.pipe';
import { catchError, finalize, Observable, switchMap, throwError, timeout } from 'rxjs';

@Component({
  selector: 'app-admin-orders',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, FormsModule, RouterLink, CustomDropdownComponent, TranslatePipe],
  templateUrl: './admin-orders.component.html',
  styleUrl: './admin-orders.component.css'
})
export class AdminOrdersComponent implements OnDestroy {
  private static cachedOrders: Order[] = [];

  readonly statuses: OrderStatus[] = ['Processing', 'Packed', 'Shipped', 'OutForDelivery', 'Delivered', 'Cancelled'];
  orders: Order[] = [];
  loading = false;
  updatingId: string | null = null;
  draftStatus: Record<string, OrderStatus> = {};
  statusNotes: Record<string, string> = {};
  query = '';
  statusFilter: 'all' | OrderStatus = 'all';
  loadError = '';
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private readonly refreshOnFocus = (): void => this.load(true);
  private readonly refreshOnVisible = (): void => {
    if (document.visibilityState === 'visible') this.load(true);
  };

  constructor(
    readonly auth: AuthService,
    private readonly ordersApi: OrderService,
    private readonly router: Router,
    private readonly toast: ToastService,
    private readonly i18n: LocalizationService
  ) {
    if (!this.auth.currentUser()) {
      void this.router.navigate(['/login'], { queryParams: { redirect: '/admin/orders' } });
      return;
    }

    if (AdminOrdersComponent.cachedOrders.length) this.applyOrders(AdminOrdersComponent.cachedOrders);
    this.load(AdminOrdersComponent.cachedOrders.length > 0);
    this.startAutoRefresh();
  }

  get isAdmin(): boolean {
    return this.auth.currentUser()?.role === 'admin';
  }

<<<<<<< HEAD
  get displayedOrders(): Order[] {
    const query = this.query.trim().toLowerCase();
    return this.orders.filter((order) => {
      const matchesStatus = this.statusFilter === 'all' || order.status === this.statusFilter;
      const matchesQuery = !query
        || order.id.toLowerCase().includes(query)
        || order.userEmail?.toLowerCase().includes(query)
        || order.shippingAddress.name.toLowerCase().includes(query)
        || order.shippingAddress.city.toLowerCase().includes(query)
        || order.items.some((item) => item.name.toLowerCase().includes(query));
      return matchesStatus && matchesQuery;
    });
  }

  get totalRevenueVisible(): number {
    return this.displayedOrders
      .filter((order) => order.status !== 'Cancelled')
      .reduce((sum, order) => sum + order.total, 0);
=======
  get statusOptions(): CustomDropdownOption[] {
    return this.statuses.map((status) => ({
      value: status,
      label: status === 'OutForDelivery' ? 'Out for delivery' : status,
      icon: status === 'Delivered'
        ? 'fa-circle-check'
        : status === 'Cancelled'
          ? 'fa-circle-xmark'
          : 'fa-truck-fast'
    }));
  }

  setDraftStatus(orderId: string, status: string): void {
    this.draftStatus[orderId] = this.statuses.includes(status as OrderStatus) ? status as OrderStatus : 'Processing';
>>>>>>> 67a49997241224711419fad6b0469c31141d23b9
  }

  ngOnDestroy(): void {
    if (this.refreshTimer) window.clearInterval(this.refreshTimer);
    window.removeEventListener('focus', this.refreshOnFocus);
    document.removeEventListener('visibilitychange', this.refreshOnVisible);
  }

  load(silent = false): void {
    if (!this.isAdmin || this.loading) return;

    this.loading = !silent;
    if (!silent) this.loadError = '';
    this.adminRequest((token) => this.ordersApi.getAdminOrders(token)).pipe(
      timeout(10000),
      finalize(() => {
        this.loading = false;
      })
    ).subscribe({
      next: (response) => {
        const orders = Array.isArray(response) ? response : [response].filter(Boolean);
        this.applyOrders(orders);
      },
      error: () => {
        if (!this.orders.length) this.loadError = this.i18n.t('ordersLoadFailed');
        else this.toast.show(this.i18n.t('ordersRefreshFailed'), 'error');
      }
    });
  }

  updateStatus(order: Order): void {
    const status = this.draftStatus[order.id];
    if (!status || status === order.status || this.updatingId) return;

    this.updatingId = order.id;
    this.adminRequest((token) => this.ordersApi.updateStatus(order.id, status, token, this.statusNotes[order.id] || '')).subscribe({
      next: (updated) => {
        this.orders = this.orders.map((item) => (item.id === updated.id ? updated : item));
        AdminOrdersComponent.cachedOrders = this.orders;
        this.draftStatus[updated.id] = updated.status;
        this.statusNotes[updated.id] = '';
        this.updatingId = null;
      },
      error: () => {
        this.updatingId = null;
        this.toast.show(this.i18n.t('orderStatusUpdateFailed'), 'error');
      }
    });
  }

  statusLabel(status: string): string {
    const key = `status_${status.toLowerCase().replaceAll(' ', '').replaceAll('-', '')}`;
    const translated = this.i18n.t(key);
    return translated === key ? status : translated;
  }

  paymentMethodLabel(method: string | undefined): string {
    if (method === 'wallet') return this.i18n.t('wallet');
    if (method === 'card') return 'Card';
    if (method === 'instapay') return 'InstaPay';
    return this.i18n.t('cash');
  }

  printPackingSlip(order: Order): void {
    const lines = order.items.map((item) => `${item.name} x${item.quantity}`).join('\n');
    const summary = [
      `Order: ${order.id}`,
      `Customer: ${order.shippingAddress.name} <${order.userEmail}>`,
      `Phone/address: ${order.shippingAddress.street}, ${order.shippingAddress.city}`,
      `Courier: ${order.courierName || 'Not assigned'}`,
      `Tracking: ${order.trackingNumber || 'Not assigned'}`,
      `Payment: ${this.paymentMethodLabel(order.paymentMethod)} / ${order.paymentStatus || 'pending'}`,
      `Items:\n${lines}`,
      `Total: ${order.total}`
    ].join('\n\n');
    window.alert(summary);
  }

  private applyOrders(orders: Order[]): void {
    this.orders = orders;
    AdminOrdersComponent.cachedOrders = orders;
    this.loadError = '';
    this.loading = false;
    this.draftStatus = {};
    this.statusNotes = {};
    for (const order of orders) {
      this.draftStatus[order.id] = order.status;
      this.statusNotes[order.id] = '';
    }
  }

  private adminRequest<T>(request: (token: string) => Observable<T>): Observable<T> {
    const currentToken = this.auth.currentAccessToken();
    if (currentToken) return request(currentToken).pipe(catchError((error) => this.retryWithFreshToken(error, request)));

    return this.auth.refreshAdminAccessToken().pipe(
      switchMap((token) => (token ? request(token) : throwError(() => new Error('No admin token'))))
    );
  }

  private retryWithFreshToken<T>(error: unknown, request: (token: string) => Observable<T>): Observable<T> {
    if (!(error instanceof HttpErrorResponse) || (error.status !== 401 && error.status !== 403)) {
      return throwError(() => error);
    }

    return this.auth.refreshAdminAccessToken().pipe(
      switchMap((token) => (token ? request(token) : throwError(() => error)))
    );
  }

  private startAutoRefresh(): void {
    if (!this.isAdmin) return;
    this.refreshTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') this.load(true);
    }, 30000);
    window.addEventListener('focus', this.refreshOnFocus);
    document.addEventListener('visibilitychange', this.refreshOnVisible);
  }
}
