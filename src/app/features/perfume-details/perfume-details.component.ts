import { EgpPipe } from '@shared/pipes/egp.pipe';
import { DatePipe } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ProductReview } from '@core/models/store.models';
import { PerfumeCardComponent } from '@shared/components/perfume-card/perfume-card.component';
import { StarRatingComponent } from '@shared/components/star-rating/star-rating.component';
import { CartService } from '@core/services/cart.service';
import { OrderService } from '@core/services/order.service';
import { PerfumeService } from '@core/services/perfume.service';
import { WishlistService } from '@core/services/wishlist.service';
import { TranslatePipe } from '@shared/pipes/translate.pipe';

@Component({
  selector: 'app-perfume-details-page',
  standalone: true,
  imports: [EgpPipe, DatePipe, PerfumeCardComponent, RouterLink, StarRatingComponent, TranslatePipe],
  templateUrl: './perfume-details.component.html',
  styleUrl: './perfume-details.component.css'
})
export class PerfumeDetailsPageComponent implements OnInit {
  readonly reviews = signal<ProductReview[]>([]);
  readonly loadingReviews = signal(true);

  constructor(
    private readonly route: ActivatedRoute,
    readonly perfumeService: PerfumeService,
    private readonly orderService: OrderService,
    readonly cart: CartService,
    readonly wishlist: WishlistService
  ) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const id = Number(params.get('id'));
      if (id) {
        this.loadReviews(id);
      }
    });
  }

  loadReviews(productId: number): void {
    this.loadingReviews.set(true);
    this.orderService.getProductReviews(productId).subscribe({
      next: (data) => {
        this.reviews.set(data);
        this.loadingReviews.set(false);
      },
      error: () => {
        this.loadingReviews.set(false);
      }
    });
  }

  get perfume() {
    return this.perfumeService.findById(Number(this.route.snapshot.paramMap.get('id')));
  }

  useFallback(event: Event): void {
    (event.target as HTMLImageElement).src = 'https://via.placeholder.com/800x800/1B4D4D/FFFFFF?text=Gnouby+Perfume';
  }
}
