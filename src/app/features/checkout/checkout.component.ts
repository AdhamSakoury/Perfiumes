import { CurrencyPipe } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Order } from '@core/models/store.models';
import { AuthService } from '@core/services/auth.service';
import { CartService } from '@core/services/cart.service';
import { ToastService } from '@core/services/toast.service';

@Component({
  selector: 'app-checkout-page',
  standalone: true,
  imports: [CurrencyPipe, FormsModule, RouterLink],
  templateUrl: './checkout.component.html',
  styleUrl: './checkout.component.css'
})
export class CheckoutPageComponent {
  form = { name: '', email: '', phone: '', address: '', city: '', postal: '' };
  error = '';
  processing = false;

  constructor(readonly cart: CartService, readonly auth: AuthService, private readonly toast: ToastService, private readonly router: Router) {
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
      this.error = 'Please complete all shipping fields with valid values.';
      return;
    }

    const user = this.auth.currentUser();
    if (!user) return;
    this.processing = true;

    const order: Order = {
      id: `ORD-${Date.now().toString(36).toUpperCase()}`,
      date: new Date().toISOString(),
      status: 'Processing',
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

    this.auth.updateCurrentUser({ ...user, orders: [order, ...(user.orders || [])] });
    this.cart.clear();
    this.cart.clearPromo();
    this.toast.show('Order placed successfully! Thank you for shopping with Gnouby Perfumes.');
    void this.router.navigateByUrl('/orders');
  }
}

