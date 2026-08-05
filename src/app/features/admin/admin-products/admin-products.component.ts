import { CurrencyPipe } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Perfume } from '@core/models/store.models';
import { AuthService } from '@core/services/auth.service';
import { PerfumeService } from '@core/services/perfume.service';
import { ToastService } from '@core/services/toast.service';

type ProductForm = Omit<Perfume, 'id' | 'notes' | 'season'> & {
  id?: number;
  notesText: string;
  seasonText: string;
};

const EMPTY_FORM: ProductForm = {
  name: '',
  brand: 'Gnouby',
  price: 0,
  rating: 4.5,
  gender: 'Unisex',
  image: 'https://placehold.co/600x600?text=Gnouby+Perfume',
  description: '',
  category: '',
  notesText: '',
  concentration: 'Eau de Parfum',
  seasonText: 'All Seasons',
  stockQuantity: 20,
  isFeatured: false
};

@Component({
  selector: 'app-admin-products',
  standalone: true,
  imports: [CurrencyPipe, FormsModule, RouterLink],
  templateUrl: './admin-products.component.html',
  styleUrl: './admin-products.component.css'
})
export class AdminProductsComponent {
  form: ProductForm = { ...EMPTY_FORM };
  saving = false;
  deletingId: number | null = null;
  tokenLoading = false;
  readonly pageSize = 10;
  currentPage = 1;
  pageAnimating = false;

  constructor(
    readonly auth: AuthService,
    readonly perfumeService: PerfumeService,
    private readonly router: Router,
    private readonly toast: ToastService
  ) {
    if (!this.auth.currentUser()) {
      void this.router.navigate(['/login'], { queryParams: { redirect: '/admin/products' } });
    }
  }

  get isAdmin(): boolean {
    return this.auth.currentUser()?.role === 'admin';
  }

  get products(): Perfume[] {
    return this.perfumeService.perfumes;
  }

  get pageCount(): number {
    return Math.max(1, Math.ceil(this.products.length / this.pageSize));
  }

  get safeCurrentPage(): number {
    return Math.min(this.currentPage, this.pageCount);
  }

  get paginatedProducts(): Perfume[] {
    const start = (this.safeCurrentPage - 1) * this.pageSize;
    return this.products.slice(start, start + this.pageSize);
  }

  get pageStart(): number {
    if (!this.products.length) return 0;
    return (this.safeCurrentPage - 1) * this.pageSize + 1;
  }

  get pageEnd(): number {
    return Math.min(this.safeCurrentPage * this.pageSize, this.products.length);
  }

  get pages(): number[] {
    return Array.from({ length: this.pageCount }, (_, index) => index + 1);
  }

  get isEditing(): boolean {
    return typeof this.form.id === 'number';
  }

  setPage(page: number): void {
    const nextPage = Math.min(Math.max(page, 1), this.pageCount);
    if (nextPage === this.safeCurrentPage) return;

    this.currentPage = nextPage;
    this.pageAnimating = true;
    setTimeout(() => {
      this.pageAnimating = false;
    }, 260);
  }

  nextPage(): void {
    this.setPage(this.safeCurrentPage + 1);
  }

  previousPage(): void {
    this.setPage(this.safeCurrentPage - 1);
  }

  submit(): void {
    if (!this.isAdmin || this.saving) return;
    if (!this.form.name.trim() || !this.form.brand.trim() || !this.form.category.trim()) {
      this.toast.show('Please fill name, brand, and category.', 'error');
      return;
    }

    this.saving = true;
    this.withAdminToken((token) => {
      const payload = this.formToPayload();
      const request = this.isEditing
        ? this.perfumeService.update(this.form.id!, payload, token)
        : this.perfumeService.create(payload, token);

      request.subscribe({
        next: () => {
          this.toast.show(this.isEditing ? 'Product updated.' : 'Product added.');
          this.resetForm();
          this.perfumeService.loadProducts();
          this.setPage(1);
          this.saving = false;
        },
        error: () => {
          this.toast.show('Could not save product. Check backend/admin token.', 'error');
          this.saving = false;
        }
      });
    });
  }

  edit(product: Perfume): void {
    this.form = {
      ...product,
      notesText: product.notes.join(', '),
      seasonText: product.season.join(', '),
      stockQuantity: product.stockQuantity ?? 20,
      isFeatured: !!product.isFeatured
    };
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  delete(product: Perfume): void {
    if (!this.isAdmin || this.deletingId) return;
    const confirmed = window.confirm(`Delete ${product.name}?`);
    if (!confirmed) return;

    this.deletingId = product.id;
    this.withAdminToken((token) => {
      this.perfumeService.delete(product.id, token).subscribe({
        next: () => {
          this.toast.show('Product deleted.');
          if (this.form.id === product.id) this.resetForm();
          this.perfumeService.loadProducts();
          if (this.paginatedProducts.length === 1 && this.safeCurrentPage > 1) {
            this.setPage(this.safeCurrentPage - 1);
          }
          this.deletingId = null;
        },
        error: () => {
          this.toast.show('Could not delete product.', 'error');
          this.deletingId = null;
        }
      });
    });
  }

  resetForm(): void {
    this.form = { ...EMPTY_FORM };
  }

  private withAdminToken(callback: (token: string) => void): void {
    const currentToken = this.auth.currentAccessToken();
    if (currentToken) {
      callback(currentToken);
      return;
    }

    const user = this.auth.currentUser();
    if (!user?.password) {
      this.toast.show('Please login again as admin.', 'error');
      this.saving = false;
      this.deletingId = null;
      return;
    }

    this.tokenLoading = true;
    this.auth.loginAdminApi(user.email, user.password).subscribe({
      next: (token) => {
        this.tokenLoading = false;
        callback(token);
      },
      error: () => {
        this.tokenLoading = false;
        this.saving = false;
        this.deletingId = null;
        this.toast.show('Admin API login failed. Please login again.', 'error');
      }
    });
  }

  private formToPayload(): Omit<Perfume, 'id'> {
    return {
      name: this.form.name.trim(),
      brand: this.form.brand.trim(),
      price: Number(this.form.price),
      rating: Number(this.form.rating),
      gender: this.form.gender,
      image: this.form.image.trim(),
      description: this.form.description.trim(),
      category: this.form.category.trim(),
      notes: this.splitList(this.form.notesText),
      concentration: this.form.concentration.trim(),
      season: this.splitList(this.form.seasonText),
      stockQuantity: Number(this.form.stockQuantity ?? 0),
      isFeatured: !!this.form.isFeatured
    };
  }

  private splitList(value: string): string[] {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
}
