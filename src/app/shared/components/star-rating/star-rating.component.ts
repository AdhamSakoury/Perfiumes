import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-star-rating',
  standalone: true,
  templateUrl: './star-rating.component.html',
  styleUrl: './star-rating.component.css'
})
export class StarRatingComponent {
  @Input({ required: true }) rating = 0;

  get stars(): string[] {
    return Array.from({ length: 5 }, (_, index) => {
      const value = index + 1;
      if (value <= this.rating) return 'fas fa-star';
      if (value - 0.5 <= this.rating) return 'fas fa-star-half-alt';
      return 'far fa-star';
    });
  }
}

