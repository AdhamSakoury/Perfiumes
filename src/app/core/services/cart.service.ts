import { computed, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CartItem, CartLine, PromoData } from '@core/models/store.models';
import { AuthService } from './auth.service';
import { PerfumeService } from './perfume.service';
import { PromoCodeService } from './promo-code.service';
import { StorageService } from './storage.service';
import { ToastService } from './toast.service';
import { LocalizationService } from './localization.service';
import { Observable, catchError, map, of, tap } from 'rxjs';

const CART_KEY = 'gnouby_cart';
const PROMO_KEY = 'gnouby_promo';

@Injectable({ providedIn: 'root' })
export class CartService {
  readonly items = signal<CartItem[]>(this.storage.get<CartItem[]>(CART_KEY, []));
  readonly promo = signal<PromoData | null>(this.storage.get<PromoData | null>(PROMO_KEY, null));
  readonly lines = computed<CartLine[]>(() => this.items()
    .map((item) => {
      const perfume = this.perfumes.findById(item.perfumeId);
      return perfume ? { ...item, perfume, lineTotal: perfume.price * item.quantity } : null;
    })
    .filter((line): line is CartLine => !!line));
  readonly subtotal = computed(() => this.lines().reduce((sum, line) => sum + line.lineTotal, 0));
  readonly discount = computed(() => this.promo() ? this.subtotal() * this.promo()!.discount : 0);
  readonly total = computed(() => this.subtotal() - this.discount());
  readonly count = computed(() => this.items().reduce((sum, item) => sum + item.quantity, 0));

  constructor(
    private readonly storage: StorageService,
    private readonly perfumes: PerfumeService,
    private readonly promoCodes: PromoCodeService,
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly toast: ToastService,
    private readonly i18n: LocalizationService
  ) {}

  add(perfumeId: number, quantity = 1): boolean {
    if (!this.auth.currentUser()) {
      void this.router.navigate(['/login'], { queryParams: { redirect: this.router.url } });
      return false;
    }

    const perfume = this.perfumes.findById(perfumeId);
    if (!perfume || (perfume.stockQuantity ?? 0) <= 0) {
      this.toast.show('This perfume is currently out of stock.', 'error');
      return false;
    }

    const items = [...this.items()];
    const existing = items.find((item) => item.perfumeId === perfumeId);
    const nextQuantity = (existing?.quantity || 0) + quantity;
    if (nextQuantity > (perfume.stockQuantity ?? nextQuantity)) {
      this.toast.show(`Only ${perfume.stockQuantity} item(s) available.`, 'error');
      return false;
    }

    if (existing) existing.quantity = nextQuantity;
    else items.push({ perfumeId, quantity });
    this.save(items);
    this.toast.show(this.i18n.t('addedToCart'), 'success');
    return true;
  }

  setQuantity(perfumeId: number, quantity: number): void {
    if (quantity <= 0) {
      this.remove(perfumeId);
      return;
    }
    this.save(this.items().map((item) => item.perfumeId === perfumeId ? { ...item, quantity } : item));
  }

  remove(perfumeId: number): void {
    this.save(this.items().filter((item) => item.perfumeId !== perfumeId));
  }

  clear(): void {
    this.storage.remove(CART_KEY);
    this.items.set([]);
  }

  applyPromo(code: string): Observable<boolean> {
    const normalized = code.trim().toUpperCase();
    if (!normalized) {
      this.clearPromo();
      this.toast.show(this.i18n.t('invalidPromo'), 'error');
      return of(false);
    }

    return this.promoCodes.validate(normalized).pipe(
      tap((promo) => {
        const appliedPromo = { code: promo.code, discount: promo.discount, expiresAt: promo.expiresAt };
        this.storage.set(PROMO_KEY, appliedPromo);
        this.promo.set(appliedPromo);
        this.toast.show(this.i18n.t('promoApplied').replace('{code}', promo.code).replace('{discount}', String(Math.round(promo.discount * 100))), 'success');
      }),
      map(() => true),
      catchError(() => {
        this.clearPromo();
        this.toast.show(this.i18n.t('invalidPromo'), 'error');
        return of(false);
      })
    );
  }

  clearPromo(): void {
    this.storage.remove(PROMO_KEY);
    this.promo.set(null);
  }

  private save(items: CartItem[]): void {
    this.storage.set(CART_KEY, items);
    this.items.set(items);
  }
}

