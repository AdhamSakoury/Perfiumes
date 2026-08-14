import { HttpClient } from '@angular/common/http';
import { HttpHeaders } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { filters, promoCodes } from '../data/perfumes.data';
import { Perfume, ProductFilters } from '@core/models/store.models';
import { environment } from '../../../environments/environment';
import { finalize } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class PerfumeService {
  readonly products = signal<Perfume[]>([]);
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly filters = filters;
  readonly promoCodes = promoCodes;
  private hasLoadedProducts = false;

  constructor(private readonly http: HttpClient) {
    this.loadProducts();
  }

  get perfumes(): Perfume[] {
    return this.products();
  }

  loadProducts(force = false): void {
    if (this.loading()) return;
    if (this.hasLoadedProducts && !force) return;

    const hasProducts = this.products().length > 0;
    this.loading.set(!hasProducts);
    this.loadError.set(null);

    this.http.get<Perfume[]>(`${environment.apiBaseUrl}/api/products`).pipe(
      finalize(() => this.loading.set(false))
    ).subscribe({
      next: (products) => {
        this.hasLoadedProducts = true;
        this.products.set(products);
      },
      error: () => {
        if (!hasProducts) this.products.set([]);
        this.loadError.set('Could not load products from the backend.');
      }
    });
  }

  featured(limit = 6): Perfume[] {
    return this.perfumes.slice(0, limit);
  }

  findById(id: number): Perfume | undefined {
    return this.perfumes.find((perfume) => perfume.id === id);
  }

  relatedTo(current: Perfume, limit = 3): Perfume[] {
    return this.perfumes
      .filter((perfume) => perfume.id !== current.id && (perfume.gender === current.gender || perfume.brand === current.brand))
      .slice(0, limit);
  }

  brands(): string[] {
    return [...new Set(this.perfumes.map((perfume) => perfume.brand))].sort();
  }

  priceBounds(): { min: number; max: number } {
    const prices = this.perfumes.map((perfume) => perfume.price);
    if (!prices.length) {
      return { min: 0, max: 500 };
    }

    return {
      min: Math.floor(Math.min(...prices)),
      max: Math.ceil(Math.max(...prices))
    };
  }

  filter(list: Perfume[], active: ProductFilters): Perfume[] {
    return list.filter((perfume) => {
      if (active.gender.length && !active.gender.includes(perfume.gender)) return false;
      if (active.rating > 0 && perfume.rating < active.rating) return false;
      if (active.brands.length && !active.brands.includes(perfume.brand)) return false;
      return perfume.price >= active.priceMin && perfume.price <= active.priceMax;
    });
  }

  sort(list: Perfume[], sort: string): Perfume[] {
    const sorted = [...list];
    switch (sort) {
      case 'price-low':
        return sorted.sort((a, b) => a.price - b.price);
      case 'price-high':
        return sorted.sort((a, b) => b.price - a.price);
      case 'rating':
        return sorted.sort((a, b) => b.rating - a.rating);
      case 'name':
        return sorted.sort((a, b) => a.name.localeCompare(b.name));
      default:
        return sorted;
    }
  }

  create(product: Omit<Perfume, 'id'>, token: string) {
    return this.http.post<Perfume>(`${environment.apiBaseUrl}/api/products`, product, { headers: this.adminHeaders(token) });
  }

  update(id: number, product: Omit<Perfume, 'id'>, token: string) {
    return this.http.put<Perfume>(`${environment.apiBaseUrl}/api/products/${id}`, product, { headers: this.adminHeaders(token) });
  }

  delete(id: number, token: string) {
    return this.http.delete<void>(`${environment.apiBaseUrl}/api/products/${id}`, { headers: this.adminHeaders(token) });
  }

  private adminHeaders(token: string): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }
}

