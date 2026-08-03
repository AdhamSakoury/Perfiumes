import { CurrencyPipe } from '@angular/common';
import { Component } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PerfumeCardComponent } from '@shared/components/perfume-card/perfume-card.component';
import { StarRatingComponent } from '@shared/components/star-rating/star-rating.component';
import { CartService } from '@core/services/cart.service';
import { PerfumeService } from '@core/services/perfume.service';
import { WishlistService } from '@core/services/wishlist.service';

@Component({
  selector: 'app-perfume-details-page',
  standalone: true,
  imports: [CurrencyPipe, PerfumeCardComponent, RouterLink, StarRatingComponent],
  templateUrl: './perfume-details.component.html',
  styleUrl: './perfume-details.component.css'
})
export class PerfumeDetailsPageComponent {
  readonly perfume = this.perfumeService.findById(Number(this.route.snapshot.paramMap.get('id')));

  constructor(
    private readonly route: ActivatedRoute,
    readonly perfumeService: PerfumeService,
    readonly cart: CartService,
    readonly wishlist: WishlistService
  ) {}

  useFallback(event: Event): void {
    (event.target as HTMLImageElement).src = 'https://via.placeholder.com/800x800/1B4D4D/FFFFFF?text=Gnouby+Perfume';
  }
}

