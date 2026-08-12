import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PerfumeCardComponent } from '@shared/components/perfume-card/perfume-card.component';
import { AuthService } from '@core/services/auth.service';
import { WishlistService } from '@core/services/wishlist.service';
import { TranslatePipe } from '@shared/pipes/translate.pipe';

@Component({
  selector: 'app-wishlist-page',
  standalone: true,
  imports: [PerfumeCardComponent, RouterLink, TranslatePipe],
  templateUrl: './wishlist.component.html',
  styleUrl: './wishlist.component.css'
})
export class WishlistPageComponent {
  constructor(readonly wishlist: WishlistService, readonly auth: AuthService) {}
}

