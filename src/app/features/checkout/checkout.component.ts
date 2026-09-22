import { EgpPipe } from '@shared/pipes/egp.pipe';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, effect, NgZone, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CheckoutQuote, DeliveryZone, DetectedLocationResult, Order } from '@core/models/store.models';
import { AuthService } from '@core/services/auth.service';
import { CartService } from '@core/services/cart.service';
import { DeliveryZoneService } from '@core/services/delivery-zone.service';
import { OrderService } from '@core/services/order.service';
import { PaymentService } from '@core/services/payment.service';
import { PerfumeService } from '@core/services/perfume.service';
import { ToastService } from '@core/services/toast.service';
import { LocalizationService } from '@core/services/localization.service';
import { TranslatePipe } from '@shared/pipes/translate.pipe';
import { translateAddress } from '@core/utils/address-translator.util';
import { catchError, finalize, map, Subscription, switchMap, throwError, timeout, TimeoutError } from 'rxjs';

@Component({
  selector: 'app-checkout-page',
  standalone: true,
  imports: [EgpPipe, FormsModule, RouterLink, TranslatePipe],
  templateUrl: './checkout.component.html',
  styleUrl: './checkout.component.css'
})
export class CheckoutPageComponent implements OnInit, OnDestroy {
  form = { name: '', email: '', phone: '', address: '', city: '', postal: '' };
  paymentMethod: 'cashOnDelivery' | 'wallet' | 'card' | 'instapay' = 'cashOnDelivery';
  selectedZoneId = '';
  selectedAreaId = '';
  detectedZoneInfo: DetectedLocationResult | null = null;
  showManualZoneSelection = false;
  zones: DeliveryZone[] = [];
  quote: CheckoutQuote | null = null;
  quoting = false;
  quoteError = '';
  error = '';
  processing = false;
  processingStep: 'idle' | 'placing' | 'paymob' = 'idle';
  cardGatewayReady: boolean | null = null;
  paymentNotice = 'Your order will be confirmed immediately. You pay the full amount when it arrives.';
  gpsLoading = false;
  addressDetecting = false;
  gpsError = '';
  private quoteTimer?: ReturnType<typeof setTimeout>;
  private addressDebounceTimer?: ReturnType<typeof setTimeout>;
  private processingWatchdog?: ReturnType<typeof setTimeout>;
  private paymentAttemptId?: string;
  private locationDetection?: Subscription;
  private locationRequestId = 0;
  private lastDetectedAddress = '';
  private lastGpsCoords: { lat: number; lng: number } | null = null;

  constructor(
    readonly cart: CartService,
    readonly auth: AuthService,
    private readonly orders: OrderService,
    private readonly payments: PaymentService,
    private readonly perfumes: PerfumeService,
    private readonly deliveryZones: DeliveryZoneService,
    private readonly toast: ToastService,
    private readonly router: Router,
    private readonly i18n: LocalizationService,
    private readonly ngZone: NgZone,
    private readonly cdr: ChangeDetectorRef
  ) {
    // When the site language changes:
    // 1) If we have GPS coordinates, silently re-run reverse-geocoding in the new language.
    // 2) If user has a typed or saved address, dynamically localize it to the new language.
    effect(() => {
      const lang = this.i18n.language(); // reactive — tracks the signal
      if (this.lastGpsCoords) {
        const { lat, lng } = this.lastGpsCoords;
        this.ngZone.run(() => this.detectZone(lat, lng, undefined, 'gps'));
      } else if (this.form.address && this.form.address.trim()) {
        this.ngZone.run(() => {
          this.form.address = translateAddress(this.form.address, lang);
          this.markViewDirty();
        });
      }
    });
  }

  ngOnInit(): void {
    const user = this.auth.currentUser();
    if (user) {
      this.form.name = user.fullName;
      this.form.email = user.email;
      this.form.phone = user.phone || '';
      this.form.address = translateAddress(user.address || '', this.i18n.language());
    }

    this.loadZones();

    if (this.form.address.trim()) {
      this.detectZone(undefined, undefined, this.form.address.trim(), 'address');
    }

    this.payments.paymobAvailability().subscribe({
      next: (status) => {
        this.cardGatewayReady = status.configured;
        this.markViewDirty();
      },
      error: () => {
        this.cardGatewayReady = false;
        this.markViewDirty();
      }
    });
  }

  private markViewDirty(): void {
    try {
      this.cdr.detectChanges();
    } catch {
      this.cdr.markForCheck();
    }
  }

  ngOnDestroy(): void {
    this.clearProcessingWatchdog();
    this.cancelLocationDetection();
    if (this.quoteTimer) clearTimeout(this.quoteTimer);
    if (this.addressDebounceTimer) clearTimeout(this.addressDebounceTimer);
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

  toggleManualZoneSelection(): void {
    this.showManualZoneSelection = !this.showManualZoneSelection;
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
    this.scheduleQuote();
    this.markViewDirty();
  }

  onAreaChange(): void {
    this.scheduleQuote();
    this.markViewDirty();
  }

  onAddressInput(): void {
    if (this.addressDebounceTimer) clearTimeout(this.addressDebounceTimer);
    const addr = this.form.address?.trim() ?? '';
    if (addr.length < 3) {
      this.cancelLocationDetection();
      this.addressDetecting = false;
      this.lastDetectedAddress = '';
      this.markViewDirty();
      return;
    }

    const normalizedAddress = this.normalizeAddress(addr);
    if (normalizedAddress === this.lastDetectedAddress) return;

    this.addressDebounceTimer = setTimeout(() => {
      this.ngZone.run(() => {
        this.detectZone(undefined, undefined, addr, 'address');
        this.markViewDirty();
      });
    }, 350);
  }

  locateRealtime(): void {
    if (!navigator.geolocation) {
      this.gpsError = this.i18n.t('gpsNotSupported');
      this.markViewDirty();
      return;
    }
    this.gpsLoading = true;
    this.gpsError = '';
    this.markViewDirty();

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.ngZone.run(() => {
          const { latitude, longitude } = pos.coords;
          this.detectZone(latitude, longitude);
          this.markViewDirty();
        });
      },
      (positionError) => {
        this.ngZone.run(() => {
          this.gpsLoading = false;
          this.gpsError = positionError.code === positionError.PERMISSION_DENIED
            ? this.i18n.t('gpsDenied')
            : positionError.code === positionError.TIMEOUT
              ? this.i18n.t('gpsTimedOut')
              : this.i18n.t('gpsFetchError');
          this.markViewDirty();
        });
      },
      // Reuse only a very recent GPS fix; this avoids a second hardware scan without
      // accepting a stale location.
      { timeout: 8_000, enableHighAccuracy: true, maximumAge: 30_000 }
    );
  }

  private detectZone(latitude?: number, longitude?: number, address?: string, source: 'gps' | 'address' = 'gps'): void {
    this.cancelLocationDetection();
    const requestId = ++this.locationRequestId;
    this.gpsLoading = source === 'gps';
    this.addressDetecting = source === 'address';
    this.gpsError = '';
    this.markViewDirty();

    this.locationDetection = this.deliveryZones.detectLocation(latitude, longitude, address, this.i18n.language()).pipe(
      // The API includes reverse geocoding for GPS requests. Never leave checkout in
      // a loading state if that upstream service is slow or unavailable.
      timeout(4_500),
      finalize(() => {
        this.ngZone.run(() => {
          if (requestId === this.locationRequestId) {
            this.gpsLoading = false;
            this.addressDetecting = false;
            this.markViewDirty();
          }
        });
      })
    ).subscribe({
      next: (res) => {
        this.ngZone.run(() => {
          if (requestId !== this.locationRequestId) return;
          if (res.success && res.zoneId) {
            this.detectedZoneInfo = res;
            if (latitude !== undefined && longitude !== undefined && res.formattedAddress) {
              this.form.address = res.formattedAddress;
              // Remember the coordinates so a language change can re-geocode silently.
              this.lastGpsCoords = { lat: latitude, lng: longitude };
            }
            if (res.city) {
              this.form.city = res.city;
            }
            this.selectedZoneId = res.zoneId;
            this.selectedAreaId = res.areaId || '';
            const matchingZone = this.zones.find(z => z.id === res.zoneId);
            if (matchingZone && !this.selectedAreaId && matchingZone.areas.length === 1) {
              this.selectedAreaId = matchingZone.areas[0].id;
            }
            if (source === 'address' && address) this.lastDetectedAddress = this.normalizeAddress(address);
            this.scheduleQuote();
          } else {
            this.gpsError = this.i18n.t('gpsZoneNotFound');
          }
          this.markViewDirty();
        });
      },
      error: () => {
        this.ngZone.run(() => {
          if (requestId !== this.locationRequestId) return;
          this.gpsError = this.i18n.t('gpsFetchError');
          this.markViewDirty();
        });
      }
    });
  }

  private cancelLocationDetection(): void {
    this.locationDetection?.unsubscribe();
    this.locationDetection = undefined;
  }

  private normalizeAddress(value: string): string {
    return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
  }

  placeOrder(): void {
    this.error = '';
    if (!this.form.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.form.email) || this.form.phone.replace(/\D/g, '').length < 10 || !this.form.address.trim() || !this.form.postal.trim()) {
      this.error = this.i18n.t('shippingValidationError');
      return;
    }
    if (!this.selectedZoneId) {
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
        // Stock is authoritative on the backend; refresh the shared catalog after
        // the order reserves its quantities so cards and cart limits are current.
        this.perfumes.loadProducts(true);
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
    const days = this.quote?.estimatedDays ?? this.detectedZoneInfo?.estimatedDays ?? this.selectedZone?.estimatedDays;
    return days ? `${days} business day${days === 1 ? '' : 's'}` : 'Auto-calculated';
  }

  deliveryDestination(): string {
    const typedAddress = this.form.address.trim();
    if (typedAddress) return typedAddress;
    return this.detectedZoneInfo?.city || this.selectedZone?.cityRegion || 'Your delivery address';
  }

  deliveryServiceArea(): string {
    return this.detectedZoneInfo?.zoneName || this.selectedZone?.name || '';
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
        this.ngZone.run(() => {
          this.zones = zones;
          if (!this.selectedZoneId && zones.length > 0) {
            if (this.detectedZoneInfo?.zoneId) {
              this.selectedZoneId = this.detectedZoneInfo.zoneId;
            } else {
              this.selectedZoneId = zones[0].id;
            }
          }
          const zone = this.selectedZone;
          if (zone) {
            this.form.city = this.form.city || zone.cityRegion;
            if (this.needsArea && !this.selectedAreaId && zone.areas.length === 1) {
              this.selectedAreaId = zone.areas[0].id;
            }
          }
          this.scheduleQuote();
          this.markViewDirty();
        });
      },
      error: () => {
        this.ngZone.run(() => {
          this.quoteError = this.i18n.t('deliveryZonesLoadFailed');
          this.markViewDirty();
        });
      }
    });
  }

  private scheduleQuote(): void {
    if (this.quoteTimer) clearTimeout(this.quoteTimer);
    this.quoteTimer = setTimeout(() => {
      this.ngZone.run(() => {
        this.refreshQuote();
      });
    }, 120);
  }

  private refreshQuote(): void {
    if (!this.auth.currentUser() || !this.cart.lines().length || !this.selectedZoneId) {
      this.quote = null;
      this.markViewDirty();
      return;
    }

    this.quoting = true;
    this.quoteError = '';
    this.markViewDirty();

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
        this.ngZone.run(() => {
          this.quoting = false;
          this.quote = quote;
          this.quoteError = '';
          this.markViewDirty();
        });
      },
      error: (error: unknown) => {
        this.ngZone.run(() => {
          this.quoting = false;
          this.quote = null;
          this.quoteError = error instanceof HttpErrorResponse
            ? error.error?.message || this.i18n.t('deliveryQuoteFailed')
            : this.i18n.t('deliveryQuoteFailed');
          this.markViewDirty();
        });
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

  private clearCheckoutState(): void {
    this.cart.clear();
    this.cart.clearPromo();
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
