import { DatePipe, DecimalPipe } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { PromoCode } from '@core/models/store.models';
import { AuthService } from '@core/services/auth.service';
import { PromoCodeService } from '@core/services/promo-code.service';
import { ToastService } from '@core/services/toast.service';
import { finalize, switchMap, throwError } from 'rxjs';

@Component({
  selector: 'app-admin-promos',
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule, RouterLink],
  templateUrl: './admin-promos.component.html',
  styleUrl: './admin-promos.component.css'
})
export class AdminPromosComponent {
  form = {
    code: '',
    discountPercent: 10,
    expiresAt: this.defaultExpiry()
  };
  promos: PromoCode[] = [];
  loading = false;
  saving = false;
  loadError = '';

  constructor(
    readonly auth: AuthService,
    private readonly promoService: PromoCodeService,
    private readonly router: Router,
    private readonly toast: ToastService
  ) {
    if (!this.auth.currentUser()) {
      void this.router.navigate(['/login'], { queryParams: { redirect: '/admin/promos' } });
      return;
    }

    this.load();
  }

  get isAdmin(): boolean {
    return this.auth.currentUser()?.role === 'admin';
  }

  load(): void {
    if (!this.isAdmin || this.loading) return;
    this.loading = true;
    this.loadError = '';
    this.auth.ensureAccessToken(true).pipe(
      switchMap((token) => token ? this.promoService.getAdminPromos(token) : throwError(() => new Error('No admin token'))),
      finalize(() => {
        this.loading = false;
      })
    ).subscribe({
      next: (promos) => {
        this.promos = promos;
      },
      error: () => {
        this.loadError = 'Could not load promo codes.';
      }
    });
  }

  create(): void {
    if (!this.isAdmin || this.saving) return;
    const code = this.form.code.trim().toUpperCase();
    const discount = Number(this.form.discountPercent);
    if (!code || discount <= 0 || discount > 95 || !this.form.expiresAt) {
      this.toast.show('Enter a valid promo code, discount, and expiration date.', 'error');
      return;
    }

    this.saving = true;
    this.auth.ensureAccessToken(true).pipe(
      switchMap((token) => token
        ? this.promoService.createAdminPromo(code, discount, new Date(this.form.expiresAt).toISOString(), token)
        : throwError(() => new Error('No admin token'))),
      finalize(() => {
        this.saving = false;
      })
    ).subscribe({
      next: (promo) => {
        this.promos = [promo, ...this.promos.filter((item) => item.id !== promo.id)];
        this.form = { code: '', discountPercent: 10, expiresAt: this.defaultExpiry() };
        this.toast.show('Promo code created and customers were notified.');
      },
      error: (error) => {
        this.toast.show(error?.error?.message || 'Could not create promo code.', 'error');
      }
    });
  }

  private defaultExpiry(): string {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    date.setMinutes(0, 0, 0);
    return `${date.getFullYear()}-${this.pad(date.getMonth() + 1)}-${this.pad(date.getDate())}T${this.pad(date.getHours())}:${this.pad(date.getMinutes())}`;
  }

  private pad(value: number): string {
    return String(value).padStart(2, '0');
  }
}
