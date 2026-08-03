import { Injectable } from '@angular/core';
import { filters, perfumes, promoCodes } from '../data/perfumes.data';
import { Perfume, ProductFilters } from '@core/models/store.models';

@Injectable({ providedIn: 'root' })
export class PerfumeService {
  readonly perfumes = perfumes;
  readonly filters = filters;
  readonly promoCodes = promoCodes;

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
}

