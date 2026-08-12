import { computed, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { PerfumeService } from './perfume.service';
import { StorageService } from './storage.service';
import { ToastService } from './toast.service';
import { LocalizationService } from './localization.service';

const WISHLIST_KEY = 'gnouby_wishlist';

@Injectable({ providedIn: 'root' })
export class WishlistService {
  readonly ids = signal<number[]>(this.storage.get<number[]>(WISHLIST_KEY, []));
  readonly perfumes = computed(() => this.ids()
    .map((id) => this.perfumeService.findById(id))
    .filter((perfume) => !!perfume));
  readonly count = computed(() => this.ids().length);

  constructor(
    private readonly storage: StorageService,
    private readonly perfumeService: PerfumeService,
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly toast: ToastService,
    private readonly i18n: LocalizationService
  ) {}

  has(id: number): boolean {
    return this.ids().includes(id);
  }

  toggle(id: number): boolean {
    if (this.has(id)) {
      this.remove(id);
      return false;
    }
    return this.add(id);
  }

  add(id: number): boolean {
    if (!this.auth.currentUser()) {
      void this.router.navigate(['/login'], { queryParams: { redirect: this.router.url } });
      return false;
    }

    if (!this.has(id)) {
      const ids = [...this.ids(), id];
      this.save(ids);
      this.toast.show(this.i18n.t('addedToWishlist'), 'success');
    }
    return true;
  }

  remove(id: number): void {
    this.save(this.ids().filter((perfumeId) => perfumeId !== id));
  }

  private save(ids: number[]): void {
    this.storage.set(WISHLIST_KEY, ids);
    this.ids.set(ids);
  }
}

