import { Component, effect, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PerfumeCardComponent } from '@shared/components/perfume-card/perfume-card.component';
import { ProductFilters } from '@core/models/store.models';
import { PerfumeService } from '@core/services/perfume.service';
import { ScrollLockService } from '@core/services/scroll-lock.service';
import { LocalizationService } from '@core/services/localization.service';
import { TranslatePipe } from '@shared/pipes/translate.pipe';

@Component({
  selector: 'app-perfumes-page',
  standalone: true,
  imports: [FormsModule, PerfumeCardComponent, TranslatePipe],
  templateUrl: './perfumes.component.html',
  styleUrl: './perfumes.component.css'
})
export class PerfumesPageComponent {
  readonly filtersOpen = signal(false);
  readonly sortOpen = signal(false);
  readonly sortOptions = [
    { value: 'default', labelKey: 'defaultSort' },
    { value: 'price-low', labelKey: 'priceLowHigh' },
    { value: 'price-high', labelKey: 'priceHighLow' },
    { value: 'rating', labelKey: 'topRated' },
    { value: 'name', labelKey: 'name' }
  ];
  sort = 'default';
  filters: ProductFilters = {
    gender: [],
    rating: 0,
    brands: [],
    priceMin: 0,
    priceMax: 500
  };

  constructor(
    private readonly perfumeService: PerfumeService,
    private readonly scrollLock: ScrollLockService,
    private readonly i18n: LocalizationService
  ) {
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
    const key = this.sortOptions.find((option) => option.value === this.sort)?.labelKey || 'defaultSort';
    return this.i18n.t(key);
  }

  genderLabel(gender: string): string {
    return this.i18n.t(gender.toLowerCase());
  }

  ratingLabel(rating: number): string {
    return rating === 0
      ? this.i18n.t('anyRating')
      : this.i18n.t('starsAndUp').replace('{rating}', String(rating));
  }
}

