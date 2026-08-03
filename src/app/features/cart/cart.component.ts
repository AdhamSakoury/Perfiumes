import { CurrencyPipe } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { CartService } from '@core/services/cart.service';

@Component({
  selector: 'app-cart-page',
  standalone: true,
  imports: [CurrencyPipe, FormsModule, RouterLink],
  templateUrl: './cart.component.html',
  styleUrl: './cart.component.css'
})
export class CartPageComponent {
  promoCode = '';

  constructor(readonly cart: CartService, readonly auth: AuthService) {}

  applyPromo(): void {
    if (this.cart.applyPromo(this.promoCode)) this.promoCode = '';
  }
}

