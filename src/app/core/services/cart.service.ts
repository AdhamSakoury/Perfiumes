import { computed, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CartItem, CartLine, PromoData } from '@core/models/store.models';
import { AuthService } from './auth.service';
import { PerfumeService } from './perfume.service';
import { StorageService } from './storage.service';
import { ToastService } from './toast.service';

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
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly toast: ToastService
  ) {}

  add(perfumeId: number, quantity = 1): boolean {
    if (!this.auth.currentUser()) {
      void this.router.navigate(['/login'], { queryParams: { redirect: this.router.url } });
      return false;
    }

    const items = [...this.items()];
    const existing = items.find((item) => item.perfumeId === perfumeId);
    if (existing) existing.quantity += quantity;
    else items.push({ perfumeId, quantity });
    this.save(items);
    this.toast.show('Added to cart!', 'success');
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

  applyPromo(code: string): boolean {
    const normalized = code.trim().toUpperCase();
    const discount = this.perfumes.promoCodes[normalized];
    if (!normalized || !discount) {
      this.clearPromo();
      this.toast.show('Invalid promo code. Try NUBIAN10 or WELCOME15', 'error');
      return false;
    }

    const promo = { code: normalized, discount };
    this.storage.set(PROMO_KEY, promo);
    this.promo.set(promo);
    this.toast.show(`${normalized} applied! ${Math.round(discount * 100)}% off`, 'success');
    return true;
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

