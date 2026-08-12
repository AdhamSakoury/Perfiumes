import { CurrencyPipe } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Order } from '@core/models/store.models';
import { AuthService } from '@core/services/auth.service';
import { CartService } from '@core/services/cart.service';
import { OrderService } from '@core/services/order.service';
import { ToastService } from '@core/services/toast.service';
import { LocalizationService } from '@core/services/localization.service';
import { TranslatePipe } from '@shared/pipes/translate.pipe';

@Component({
  selector: 'app-checkout-page',
  standalone: true,
  imports: [CurrencyPipe, FormsModule, RouterLink, TranslatePipe],
  templateUrl: './checkout.component.html',
  styleUrl: './checkout.component.css'
})
export class CheckoutPageComponent {
  form = { name: '', email: '', phone: '', address: '', city: '', postal: '' };
  error = '';
  processing = false;

  constructor(
    readonly cart: CartService,
    readonly auth: AuthService,
    private readonly orders: OrderService,
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
  }

  placeOrder(): void {
    this.error = '';
    if (!this.form.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.form.email) || this.form.phone.replace(/\D/g, '').length < 10 || !this.form.address.trim() || !this.form.city.trim() || !this.form.postal.trim()) {
      this.error = this.i18n.t('shippingValidationError');
      return;
    }

    const user = this.auth.currentUser();
    if (!user) return;
    this.processing = true;

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
      total: this.cart.total(),
      shippingAddress: {
        name: this.form.name,
        street: this.form.address,
        city: this.form.city,
        state: '',
        zip: this.form.postal,
        country: 'Egypt'
      },
      promoCode: this.cart.promo()?.code || null
    };

    this.orders.create(order).subscribe({
      next: (createdOrder) => {
        this.auth.updateCurrentUser({ ...user, orders: [createdOrder, ...(user.orders || [])] });
        this.cart.clear();
        this.cart.clearPromo();
        this.processing = false;
        this.toast.show(this.i18n.t('orderPlacedSuccess'));
        void this.router.navigateByUrl('/orders');
      },
      error: () => {
        this.processing = false;
        this.error = 'Could not place your order. Please try again.';
      }
    });
  }
}

