import { EgpPipe } from '@shared/pipes/egp.pipe';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Perfume } from '@core/models/store.models';
import { CartService } from '@core/services/cart.service';
import { WishlistService } from '@core/services/wishlist.service';
import { StarRatingComponent } from '@shared/components/star-rating/star-rating.component';
import { TranslatePipe } from '@shared/pipes/translate.pipe';

@Component({
  selector: 'app-perfume-card',
  standalone: true,
  imports: [EgpPipe, RouterLink, StarRatingComponent, TranslatePipe],
  templateUrl: './perfume-card.component.html',
  styleUrl: './perfume-card.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
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

