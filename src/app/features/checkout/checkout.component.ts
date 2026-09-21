import { EgpPipe } from '@shared/pipes/egp.pipe';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CheckoutQuote, DeliveryZone, Order } from '@core/models/store.models';
import { AuthService } from '@core/services/auth.service';
import { CartService } from '@core/services/cart.service';
import { DeliveryZoneService } from '@core/services/delivery-zone.service';
import { OrderService } from '@core/services/order.service';
import { PaymentService } from '@core/services/payment.service';
import { ToastService } from '@core/services/toast.service';
import { LocalizationService } from '@core/services/localization.service';
import { TranslatePipe } from '@shared/pipes/translate.pipe';
import { catchError, map, switchMap, throwError, TimeoutError } from 'rxjs';

@Component({
  selector: 'app-checkout-page',
  standalone: true,
  imports: [EgpPipe, FormsModule, RouterLink, TranslatePipe],
  templateUrl: './checkout.component.html',
  styleUrl: './checkout.component.css'
})
export class CheckoutPageComponent implements OnDestroy {
  form = { name: '', email: '', phone: '', address: '', city: '', postal: '' };
  paymentMethod: 'cashOnDelivery' | 'wallet' | 'card' | 'instapay' = 'cashOnDelivery';
  selectedZoneId = '';
  selectedAreaId = '';
  zones: DeliveryZone[] = [];
  quote: CheckoutQuote | null = null;
  quoting = false;
  quoteError = '';
  error = '';
  processing = false;
  processingStep: 'idle' | 'placing' | 'paymob' = 'idle';
  cardGatewayReady: boolean | null = null;
  paymentNotice = 'Your order will be confirmed immediately. You pay the full amount when it arrives.';
  private processingWatchdog?: ReturnType<typeof setTimeout>;
  private quoteTimer?: ReturnType<typeof setTimeout>;
  private paymentAttemptId?: string;
  private readonly storageKey = 'perfiumes.checkout.delivery';

  constructor(
    readonly cart: CartService,
    readonly auth: AuthService,
    private readonly orders: OrderService,
    private readonly payments: PaymentService,
    private readonly deliveryZones: DeliveryZoneService,
    private readonly toast: ToastService,
    private readonly router: Router,
    private readonly i18n: LocalizationService
  ) {
    const user = this.auth.currentUser();
    if (user) {
      this.form.name = user.fullName;
      this.form.email = user.email;
      this.form.phone = user.phone || '';
      this.form.address = user.address || '';
    }

    this.restoreSelection();
    this.loadZones();
    this.payments.paymobAvailability().subscribe({
      next: (status) => this.cardGatewayReady = status.configured,
      error: () => this.cardGatewayReady = false
    });
  }

  ngOnDestroy(): void {
    this.clearProcessingWatchdog();
    if (this.quoteTimer) clearTimeout(this.quoteTimer);
  }

  get selectedZone(): DeliveryZone | undefined {
    return this.zones.find((zone) => zone.id === this.selectedZoneId);
  }

  get selectedAreas() {
    return this.selectedZone?.areas ?? [];
  }

  get needsArea(): boolean {
    return (this.selectedZone?.pricingType !== 'fixed') && this.selectedAreas.length > 0;
  }

  onPaymentMethodChange(): void {
    this.error = '';
    this.paymentNotice = this.paymentMethod === 'wallet'
      ? 'Your wallet is charged for products only. Delivery is paid when the order arrives.'
      : this.paymentMethod === 'card'
        ? this.cardGatewayReady === false
          ? 'Card checkout is temporarily unavailable. Choose wallet or cash on delivery.'
          : 'Paymob charges the product total only. Delivery is paid when the order arrives.'
        : this.paymentMethod === 'instapay'
          ? 'The product total is recorded for transfer confirmation. Delivery is paid on arrival.'
          : 'Your order will be confirmed immediately. You pay the full amount when it arrives.';
    this.scheduleQuote();
  }

  onZoneChange(): void {
    this.selectedAreaId = '';
    const zone = this.selectedZone;
    if (zone) {
      this.form.city = zone.cityRegion;
      if (zone.areas.length === 1) this.selectedAreaId = zone.areas[0].id;
    }
    this.persistSelection();
    this.scheduleQuote();
  }

  onAreaChange(): void {
    this.persistSelection();
    this.scheduleQuote();
  }

  placeOrder(): void {
    this.error = '';
    if (!this.form.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.form.email) || this.form.phone.replace(/\D/g, '').length < 10 || !this.form.address.trim() || !this.form.postal.trim()) {
      this.error = this.i18n.t('shippingValidationError');
      return;
    }
    if (!this.selectedZoneId || (this.needsArea && !this.selectedAreaId)) {
      this.error = this.i18n.t('deliveryZoneRequired');
      return;
    }
    if (this.quoteError || !this.quote) {
      this.error = this.quoteError || this.i18n.t('deliveryQuoteRequired');
      return;
    }

    const user = this.auth.currentUser();
    if (!user) return;

    if (this.paymentMethod === 'card' && this.cardGatewayReady === false) {
      this.error = 'Card checkout is currently unavailable. Please use wallet or cash on delivery.';
      return;
    }

    this.processing = true;
    this.processingStep = 'placing';
    this.startProcessingWatchdog();

    const order: Omit<Order, 'id' | 'date' | 'status' | 'trackingEvents'> & { userEmail: string } = {
      userEmail: user.email,
      items: this.cartItems(),
      subtotal: this.quote.subtotal,
      discount: this.quote.discount,
      shippingFee: this.quote.shippingFee,
      total: this.quote.total,
      onlinePaymentAmount: this.quote.onlinePaymentAmount,
      amountDueAtDelivery: this.quote.amountDueAtDelivery,
      paymentMethod: this.paymentMethod,
      paymentStatus: this.paymentMethod === 'wallet' ? (this.quote.amountDueAtDelivery > 0 ? 'partiallyPaid' : 'paid') : 'pending',
      paymentProvider: this.paymentProviderLabel(),
      paymentReference: '',
      deliveryZoneId: this.selectedZoneId,
      deliveryAreaId: this.selectedAreaId || null,
      courierName: '',
      trackingNumber: '',
      estimatedDelivery: '',
      shippingAddress: {
        name: this.form.name,
        phone: this.form.phone,
        street: this.form.address,
        city: this.form.city || this.selectedZone?.cityRegion || '',
        state: '',
        zip: this.form.postal,
        country: 'Egypt'
      },
      promoCode: this.cart.promo()?.code || null,
      clientRequestId: this.paymentAttemptId ||= crypto.randomUUID()
    };

    const orderRequest = this.auth.ensureAccessToken().pipe(
      switchMap((token) => token
        ? this.orders.create(order, token).pipe(map((createdOrder) => ({ createdOrder, token })))
        : throwError(() => new Error('No access token'))),
      catchError((error) => this.retryOrderAfterAuthError(error, order))
    );

    orderRequest.subscribe({
      next: ({ createdOrder, token }) => {
        this.auth.updateCurrentUser({ ...user, orders: [createdOrder, ...(user.orders || [])] });
        const chargeOnline = createdOrder.onlinePaymentAmount ?? this.quote?.onlinePaymentAmount ?? 0;
        if (this.paymentMethod === 'card' && chargeOnline > 0) {
          this.processingStep = 'paymob';
          this.payments.createPaymobCheckout(createdOrder.id, token).subscribe({
            next: (checkout) => {
              this.clearProcessingWatchdog();
              this.clearCheckoutState();
              window.location.href = checkout.checkoutUrl;
            },
            error: (error: unknown) => {
              this.stopProcessing();
              this.paymentAttemptId = undefined;
              this.error = error instanceof HttpErrorResponse
                ? error.error?.message || error.error?.detail || 'Could not start Paymob checkout.'
                : 'Could not start Paymob checkout.';
            }
          });
          return;
        }

        this.clearCheckoutState();
        this.stopProcessing();
        this.paymentAttemptId = undefined;
        this.toast.show(this.i18n.t('orderPlacedSuccess'));
        void this.router.navigateByUrl('/orders');
      },
      error: (error: unknown) => {
        this.stopProcessing();
        if (!(error instanceof TimeoutError)) this.paymentAttemptId = undefined;
        this.error = error instanceof TimeoutError
          ? 'The order request took too long. Please try again.'
          : error instanceof HttpErrorResponse
          ? error.error?.message || 'Could not place your order. Please try again.'
          : 'Could not place your order. Please try again.';
        this.scheduleQuote();
      }
    });
  }

  shippingFee(): number {
    return this.quote?.shippingFee ?? 0;
  }

  deliveryEta(): string {
    const days = this.quote?.estimatedDays ?? this.selectedZone?.estimatedDays;
    return days ? `${days} business day${days === 1 ? '' : 's'}` : 'Select a delivery area';
  }

  payableTotal(): number {
    return this.quote?.total ?? this.cart.total();
  }

  onlineAmount(): number {
    return this.quote?.onlinePaymentAmount ?? 0;
  }

  deliveryDueAmount(): number {
    return this.quote?.amountDueAtDelivery ?? 0;
  }

  paymentProviderLabel(): string {
    const labels: Record<string, string> = {
      cashOnDelivery: 'Cash on delivery',
      wallet: 'Gnouby wallet',
      card: 'Paymob',
      instapay: 'InstaPay manual confirmation'
    };
    return labels[this.paymentMethod];
  }

  private loadZones(): void {
    this.deliveryZones.getActive().subscribe({
      next: (zones) => {
        this.zones = zones;
        if (!this.selectedZoneId && zones.length) {
          this.selectedZoneId = zones[0].id;
        }
        if (this.selectedZoneId && !zones.some((zone) => zone.id === this.selectedZoneId)) {
          this.selectedZoneId = zones[0]?.id || '';
          this.selectedAreaId = '';
        }
        const zone = this.selectedZone;
        if (zone) {
          this.form.city = this.form.city || zone.cityRegion;
          if (this.needsArea && !this.selectedAreaId && zone.areas.length === 1) {
            this.selectedAreaId = zone.areas[0].id;
          }
        }
        this.persistSelection();
        this.scheduleQuote();
      },
      error: () => {
        this.quoteError = this.i18n.t('deliveryZonesLoadFailed');
      }
    });
  }

  private scheduleQuote(): void {
    if (this.quoteTimer) clearTimeout(this.quoteTimer);
    this.quoteTimer = setTimeout(() => this.refreshQuote(), 180);
  }

  private refreshQuote(): void {
    if (!this.auth.currentUser() || !this.cart.lines().length || !this.selectedZoneId) {
      this.quote = null;
      return;
    }
    if (this.needsArea && !this.selectedAreaId) {
      this.quote = null;
      this.quoteError = this.i18n.t('deliveryAreaRequired');
      return;
    }

    this.quoting = true;
    this.quoteError = '';
    this.auth.ensureAccessToken().pipe(
      switchMap((token) => token
        ? this.deliveryZones.quote(
            this.cartItems(),
            this.cart.promo()?.code || null,
            this.selectedZoneId,
            this.selectedAreaId || null,
            this.paymentMethod,
            token)
        : throwError(() => new Error('No access token'))),
      catchError((error) => {
        if (error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403)) {
          return this.auth.ensureAccessToken(true).pipe(
            switchMap((token) => token
              ? this.deliveryZones.quote(
                  this.cartItems(),
                  this.cart.promo()?.code || null,
                  this.selectedZoneId,
                  this.selectedAreaId || null,
                  this.paymentMethod,
                  token)
              : throwError(() => error))
          );
        }
        return throwError(() => error);
      })
    ).subscribe({
      next: (quote) => {
        this.quoting = false;
        this.quote = quote;
        this.quoteError = '';
      },
      error: (error: unknown) => {
        this.quoting = false;
        this.quote = null;
        this.quoteError = error instanceof HttpErrorResponse
          ? error.error?.message || this.i18n.t('deliveryQuoteFailed')
          : this.i18n.t('deliveryQuoteFailed');
      }
    });
  }

  private cartItems() {
    return this.cart.lines().map((line) => ({
      id: line.perfumeId,
      name: line.perfume.name,
      price: line.perfume.price,
      image: line.perfume.image,
      quantity: line.quantity
    }));
  }

  private persistSelection(): void {
    sessionStorage.setItem(this.storageKey, JSON.stringify({
      zoneId: this.selectedZoneId,
      areaId: this.selectedAreaId
    }));
  }

  private restoreSelection(): void {
    try {
      const raw = sessionStorage.getItem(this.storageKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as { zoneId?: string; areaId?: string };
      this.selectedZoneId = saved.zoneId || '';
      this.selectedAreaId = saved.areaId || '';
    } catch {
      sessionStorage.removeItem(this.storageKey);
    }
  }

  private clearCheckoutState(): void {
    this.cart.clear();
    this.cart.clearPromo();
    sessionStorage.removeItem(this.storageKey);
  }

  private retryOrderAfterAuthError(
    error: unknown,
    order: Omit<Order, 'id' | 'date' | 'status' | 'trackingEvents'> & { userEmail: string }
  ) {
    if (!(error instanceof HttpErrorResponse) || (error.status !== 401 && error.status !== 403)) {
      return throwError(() => error);
    }

    return this.auth.ensureAccessToken(true).pipe(
      switchMap((token) => token
        ? this.orders.create(order, token).pipe(map((createdOrder) => ({ createdOrder, token })))
        : throwError(() => error))
    );
  }

  private startProcessingWatchdog(): void {
    this.clearProcessingWatchdog();
    this.processingWatchdog = setTimeout(() => {
      if (!this.processing) return;
      this.stopProcessing();
      this.error = 'The payment request is not responding. Please try again.';
    }, 20_000);
  }

  private clearProcessingWatchdog(): void {
    if (this.processingWatchdog) {
      clearTimeout(this.processingWatchdog);
      this.processingWatchdog = undefined;
    }
  }

  private stopProcessing(): void {
    this.clearProcessingWatchdog();
    this.processing = false;
    this.processingStep = 'idle';
  }
}
