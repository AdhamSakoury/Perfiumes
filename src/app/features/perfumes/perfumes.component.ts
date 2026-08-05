import { Component, effect, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PerfumeCardComponent } from '@shared/components/perfume-card/perfume-card.component';
import { ProductFilters } from '@core/models/store.models';
import { PerfumeService } from '@core/services/perfume.service';
import { ScrollLockService } from '@core/services/scroll-lock.service';

@Component({
  selector: 'app-perfumes-page',
  standalone: true,
  imports: [FormsModule, PerfumeCardComponent],
  templateUrl: './perfumes.component.html',
  styleUrl: './perfumes.component.css'
})
export class PerfumesPageComponent {
  readonly filtersOpen = signal(false);
  readonly sortOpen = signal(false);
  readonly sortOptions = [
    { value: 'default', label: 'Default' },
    { value: 'price-low', label: 'Price: Low to High' },
    { value: 'price-high', label: 'Price: High to Low' },
    { value: 'rating', label: 'Top Rated' },
    { value: 'name', label: 'Name' }
  ];
  sort = 'default';
  filters: ProductFilters = {
    gender: [],
    rating: 0,
    brands: [],
    priceMin: 0,
    priceMax: 500
  };

  constructor(private readonly perfumeService: PerfumeService, private readonly scrollLock: ScrollLockService) {
    effect((onCleanup) => {
      if (!this.filtersOpen()) return;
      this.scrollLock.lock();
      onCleanup(() => this.scrollLock.unlock());
    });
  }

  get displayed() {
    return this.perfumeService.sort(this.perfumeService.filter(this.perfumeService.perfumes, this.filters), this.sort);
  }

  get bounds() {
    return this.perfumeService.priceBounds();
  }

  get brands() {
    return this.perfumeService.brands();
  }

  toggleArray(key: 'gender' | 'brands', value: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const current = this.filters[key];
    this.filters[key] = checked ? [...current, value] : current.filter((item) => item !== value);
  }

  resetFilters(): void {
    this.filters = { gender: [], rating: 0, brands: [], priceMin: this.bounds.min, priceMax: this.bounds.max };
    this.sort = 'default';
    this.sortOpen.set(false);
  }

  sortLabel(): string {
    return this.sortOptions.find((option) => option.value === this.sort)?.label || 'Default';
  }
}

