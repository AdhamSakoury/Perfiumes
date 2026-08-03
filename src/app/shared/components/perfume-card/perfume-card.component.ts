import { CurrencyPipe } from '@angular/common';
import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Perfume } from '@core/models/store.models';
import { CartService } from '@core/services/cart.service';
import { WishlistService } from '@core/services/wishlist.service';
import { StarRatingComponent } from '@shared/components/star-rating/star-rating.component';

@Component({
  selector: 'app-perfume-card',
  standalone: true,
  imports: [CurrencyPipe, RouterLink, StarRatingComponent],
  templateUrl: './perfume-card.component.html',
  styleUrl: './perfume-card.component.css'
})
export class PerfumeCardComponent {
  @Input({ required: true }) perfume!: Perfume;

  constructor(readonly wishlist: WishlistService, private readonly cart: CartService) {}

  addToCart(): void {
    this.cart.add(this.perfume.id);
  }

  toggleWishlist(): void {
    this.wishlist.toggle(this.perfume.id);
  }

  useFallback(event: Event): void {
    (event.target as HTMLImageElement).src = 'https://via.placeholder.com/400x400/1B4D4D/FFFFFF?text=Gnouby+Perfume';
  }
}

