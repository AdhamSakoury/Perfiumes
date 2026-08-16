import { Component, OnInit, effect, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PerfumeCardComponent } from '@shared/components/perfume-card/perfume-card.component';
import { ProductFilters } from '@core/models/store.models';
import { PerfumeService } from '@core/services/perfume.service';
import { ScrollLockService } from '@core/services/scroll-lock.service';
import { LocalizationService } from '@core/services/localization.service';
import { CustomDropdownComponent, CustomDropdownOption } from '@shared/components/custom-dropdown/custom-dropdown.component';
import { TranslatePipe } from '@shared/pipes/translate.pipe';

@Component({
  selector: 'app-perfumes-page',
  standalone: true,
  imports: [FormsModule, PerfumeCardComponent, CustomDropdownComponent, TranslatePipe],
  templateUrl: './perfumes.component.html',
  styleUrl: './perfumes.component.css'
})
export class PerfumesPageComponent implements OnInit {
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
  readonly pageSize = 12;
  currentPage = 1;
  filters: ProductFilters = {
    gender: [],
    rating: 0,
    brands: [],
    priceMin: 0,
    priceMax: 500
  };
  private syncedPriceMax = 500;

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

    effect(() => {
      const bounds = this.perfumeService.priceBounds();
      const shouldSyncPriceRange = this.filters.priceMax === this.syncedPriceMax || this.filters.priceMax === 500;
      if (!shouldSyncPriceRange) return;

      this.syncedPriceMax = bounds.max;
      this.filters = {
        ...this.filters,
        priceMin: bounds.min,
        priceMax: bounds.max
      };
    });
  }

  ngOnInit(): void {
    this.perfumeService.loadProducts(true);
  }

  get displayed() {
    return this.perfumeService.sort(this.perfumeService.filter(this.perfumeService.perfumes, this.filters), this.sort);
  }

  get pageCount(): number {
    return Math.max(1, Math.ceil(this.displayed.length / this.pageSize));
  }

  get safeCurrentPage(): number {
    return Math.min(this.currentPage, this.pageCount);
  }

  get paginatedDisplayed() {
    const start = (this.safeCurrentPage - 1) * this.pageSize;
    return this.displayed.slice(start, start + this.pageSize);
  }

  get pageStart(): number {
    if (!this.displayed.length) return 0;
    return (this.safeCurrentPage - 1) * this.pageSize + 1;
  }

  get pageEnd(): number {
    return Math.min(this.safeCurrentPage * this.pageSize, this.displayed.length);
  }

  get pages(): number[] {
    return Array.from({ length: this.pageCount }, (_, index) => index + 1);
  }

  get bounds() {
    return this.perfumeService.priceBounds();
  }

  get brands() {
    return this.perfumeService.brands();
  }

  get translatedSortOptions(): CustomDropdownOption[] {
    return this.sortOptions.map((option) => ({
      value: option.value,
      label: this.i18n.t(option.labelKey),
      icon: option.value === 'price-low'
        ? 'fa-arrow-down-1-9'
        : option.value === 'price-high'
          ? 'fa-arrow-up-9-1'
          : option.value === 'rating'
            ? 'fa-star'
            : option.value === 'name'
              ? 'fa-arrow-down-a-z'
              : 'fa-sparkles'
    }));
  }

  toggleArray(key: 'gender' | 'brands', value: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const current = this.filters[key];
    this.filters[key] = checked ? [...current, value] : current.filter((item) => item !== value);
    this.currentPage = 1;
  }

  setRating(rating: number): void {
    this.filters.rating = rating;
    this.currentPage = 1;
  }

  setPriceMin(value: number): void {
    this.filters.priceMin = Number(value);
    this.currentPage = 1;
  }

  setPriceMax(value: number): void {
    this.filters.priceMax = Number(value);
    this.currentPage = 1;
  }

  setSort(value: string): void {
    this.sort = value;
    this.sortOpen.set(false);
    this.currentPage = 1;
  }

  resetFilters(): void {
    this.filters = { gender: [], rating: 0, brands: [], priceMin: this.bounds.min, priceMax: this.bounds.max };
    this.sort = 'default';
    this.sortOpen.set(false);
    this.currentPage = 1;
  }

  setPage(page: number): void {
    this.currentPage = Math.min(Math.max(page, 1), this.pageCount);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  previousPage(): void {
    this.setPage(this.safeCurrentPage - 1);
  }

  nextPage(): void {
    this.setPage(this.safeCurrentPage + 1);
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

