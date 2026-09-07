import { CurrencyPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Order } from '@core/models/store.models';
import { AuthService } from '@core/services/auth.service';
import { CartService } from '@core/services/cart.service';
import { OrderService } from '@core/services/order.service';
import { PaymentService } from '@core/services/payment.service';
import { ToastService } from '@core/services/toast.service';
import { LocalizationService } from '@core/services/localization.service';
import { TranslatePipe } from '@shared/pipes/translate.pipe';
import { catchError, map, switchMap, throwError, TimeoutError } from 'rxjs';

@Component({
  selector: 'app-checkout-page',
  standalone: true,
  imports: [CurrencyPipe, FormsModule, RouterLink, TranslatePipe],
  templateUrl: './checkout.component.html',
  styleUrl: './checkout.component.css'
})
export class CheckoutPageComponent {
  form = { name: '', email: '', phone: '', address: '', city: '', postal: '' };
  paymentMethod: 'cashOnDelivery' | 'wallet' | 'card' | 'instapay' = 'cashOnDelivery';
  error = '';
  processing = false;
  processingStep: 'idle' | 'placing' | 'paymob' = 'idle';
  cardGatewayReady: boolean | null = null;
  paymentNotice = 'Your order will be confirmed immediately. You pay when it arrives.';
  private processingWatchdog?: ReturnType<typeof setTimeout>;
  private paymentAttemptId?: string;
  readonly deliveryRegions = [
    { label: 'Cairo / Giza', fee: 75, eta: '2 business days' },
    { label: 'Alexandria', fee: 95, eta: '3-4 business days' },
    { label: 'Other governorates', fee: 120, eta: '4-5 business days' }
  ];

  constructor(
    readonly cart: CartService,
    readonly auth: AuthService,
    private readonly orders: OrderService,
    private readonly payments: PaymentService,
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

    this.payments.paymobAvailability().subscribe({
      next: (status) => this.cardGatewayReady = status.configured,
      error: () => this.cardGatewayReady = false
    });
  }

  onPaymentMethodChange(): void {
    this.error = '';
    this.paymentNotice = this.paymentMethod === 'wallet'
      ? 'Your wallet is charged immediately when you place the order.'
      : this.paymentMethod === 'card'
        ? this.cardGatewayReady === false
          ? 'Card checkout is temporarily unavailable. Choose wallet or cash on delivery.'
          : 'You will be redirected securely to Paymob after placing the order.'
        : this.paymentMethod === 'instapay'
          ? 'Your order is recorded, then confirmed after the bank transfer is reviewed.'
          : 'Your order will be confirmed immediately. You pay when it arrives.';
  }

  placeOrder(): void {
    this.error = '';
    if (!this.form.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.form.email) || this.form.phone.replace(/\D/g, '').length < 10 || !this.form.address.trim() || !this.form.city.trim() || !this.form.postal.trim()) {
      this.error = this.i18n.t('shippingValidationError');
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
    const shippingFee = this.shippingFee();
    const payableTotal = this.payableTotal();

    const order: Omit<Order, 'id' | 'date' | 'status' | 'trackingEvents'> & { userEmail: string } = {
      userEmail: user.email,
      items: this.cart.lines().map((line) => ({
        id: line.perfumeId,
        name: line.perfume.name,
        price: line.perfume.price,
        image: line.perfume.image,
        quantity: line.quantity
      })),
      subtotal: this.cart.subtotal(),
      discount: this.cart.discount(),
      shippingFee,
      total: payableTotal,
      paymentMethod: this.paymentMethod,
      paymentStatus: this.paymentMethod === 'wallet' ? 'paid' : 'pending',
      paymentProvider: this.paymentProviderLabel(),
      paymentReference: '',
      courierName: '',
      trackingNumber: '',
      estimatedDelivery: '',
      shippingAddress: {
        name: this.form.name,
        phone: this.form.phone,
        street: this.form.address,
        city: this.form.city,
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
        if (this.paymentMethod === 'card') {
          this.processingStep = 'paymob';
          this.payments.createPaymobCheckout(createdOrder.id, token).subscribe({
            next: (checkout) => {
              this.clearProcessingWatchdog();
              this.cart.clear();
              this.cart.clearPromo();
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

        this.cart.clear();
        this.cart.clearPromo();
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
      }
    });
  }

  shippingFee(): number {
    const city = this.form.city.trim().toLowerCase();
    if (city.includes('cairo') || city.includes('giza') || city.includes('القاهرة') || city.includes('الجيزة')) return 75;
    if (city.includes('alex') || city.includes('alexandria') || city.includes('اسكندرية') || city.includes('الإسكندرية')) return 95;
    return 120;
  }

  deliveryEta(): string {
    const city = this.form.city.trim().toLowerCase();
    if (city.includes('cairo') || city.includes('giza') || city.includes('القاهرة') || city.includes('الجيزة')) return '2 business days';
    if (city.includes('alex') || city.includes('alexandria') || city.includes('اسكندرية') || city.includes('الإسكندرية')) return '3-4 business days';
    return '4-5 business days';
  }

  payableTotal(): number {
    return this.cart.total() + this.shippingFee();
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

