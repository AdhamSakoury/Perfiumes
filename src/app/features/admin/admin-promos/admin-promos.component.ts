import { DatePipe, DecimalPipe } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { PromoCode } from '@core/models/store.models';
import { AuthService } from '@core/services/auth.service';
import { PromoCodeService } from '@core/services/promo-code.service';
import { ToastService } from '@core/services/toast.service';
import { finalize, switchMap, throwError, timeout } from 'rxjs';

type PromoCalendarDay = {
  key: string;
  date: string;
  day: number;
  outside: boolean;
  selected: boolean;
  today: boolean;
  disabled: boolean;
};

@Component({
  selector: 'app-admin-promos',
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule, RouterLink],
  templateUrl: './admin-promos.component.html',
  styleUrl: './admin-promos.component.css'
})
export class AdminPromosComponent {
  readonly weekdays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  readonly hourOptions = Array.from({ length: 12 }, (_, index) => index + 1);
  readonly minuteOptions = [0, 15, 30, 45, 59];
  form = {
    code: '',
    discountPercent: 10,
    expiresAt: this.defaultExpiry()
  };
  calendarMonth = this.startOfMonth(new Date(this.form.expiresAt));
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

  get expiryDate(): string {
    return this.form.expiresAt.split('T')[0] || '';
  }

  get expiryTime(): string {
    return this.form.expiresAt.split('T')[1]?.slice(0, 5) || '12:00';
  }

  get calendarTitle(): string {
    return this.calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  get canMoveToPreviousMonth(): boolean {
    return this.calendarMonth > this.startOfMonth(new Date());
  }

  get expiryDateLabel(): string {
    const date = new Date(`${this.expiryDate}T00:00`);
    return Number.isNaN(date.getTime())
      ? 'Choose date'
      : date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  get expiryTimeLabel(): string {
    const [hour, minute] = this.expiryTime.split(':').map(Number);
    const normalizedHour = hour % 12 || 12;
    const period = hour >= 12 ? 'PM' : 'AM';
    return `${this.pad(normalizedHour)}:${this.pad(minute || 0)} ${period}`;
  }

  get selectedDisplayHour(): number {
    const hour = Number(this.expiryTime.split(':')[0] || 12);
    return hour % 12 || 12;
  }

  get selectedMinute(): number {
    return Number(this.expiryTime.split(':')[1] || 0);
  }

  get selectedPeriod(): 'AM' | 'PM' {
    return Number(this.expiryTime.split(':')[0] || 0) >= 12 ? 'PM' : 'AM';
  }

  get calendarDays(): PromoCalendarDay[] {
    const monthStart = this.startOfMonth(this.calendarMonth);
    const gridStart = new Date(monthStart);
    gridStart.setDate(monthStart.getDate() - monthStart.getDay());
    const today = this.today();

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      const value = this.toDateValue(date);
      return {
        key: value,
        date: value,
        day: date.getDate(),
        outside: date.getMonth() !== monthStart.getMonth(),
        selected: value === this.expiryDate,
        today: value === today,
        disabled: value < today
      };
    });
  }

  setExpiryDate(date: string): void {
    if (!date || date < this.today()) return;
    this.form.expiresAt = `${date}T${this.expiryTime}`;
    this.calendarMonth = this.startOfMonth(new Date(`${date}T00:00`));
  }

  setExpiryTime(time: string): void {
    this.form.expiresAt = `${this.expiryDate || this.today()}T${time || '12:00'}`;
  }

  moveCalendar(months: number): void {
    const next = new Date(this.calendarMonth);
    next.setMonth(next.getMonth() + months);
    if (next < this.startOfMonth(new Date())) return;
    this.calendarMonth = this.startOfMonth(next);
  }

  setExpiryHour(hour: number): void {
    const period = this.selectedPeriod;
    let hour24 = hour % 12;
    if (period === 'PM') hour24 += 12;
    this.setExpiryTime(`${this.pad(hour24)}:${this.pad(this.selectedMinute)}`);
  }

  setExpiryMinute(minute: number): void {
    const [hour] = this.expiryTime.split(':');
    this.setExpiryTime(`${hour || '12'}:${this.pad(minute)}`);
  }

  setExpiryPeriod(period: 'AM' | 'PM'): void {
    const displayHour = this.selectedDisplayHour;
    const hour24 = period === 'PM' ? (displayHour % 12) + 12 : displayHour % 12;
    this.setExpiryTime(`${this.pad(hour24)}:${this.pad(this.selectedMinute)}`);
  }

  shiftExpiry(days: number): void {
    const base = this.form.expiresAt ? new Date(this.form.expiresAt) : new Date();
    base.setDate(base.getDate() + days);
    this.form.expiresAt = this.toLocalInputValue(base);
    this.calendarMonth = this.startOfMonth(base);
  }

  load(): void {
    if (!this.isAdmin || this.loading) return;
    this.loading = true;
    this.loadError = '';
    this.auth.ensureAccessToken(true).pipe(
      switchMap((token) => token ? this.promoService.getAdminPromos(token) : throwError(() => new Error('No admin token'))),
      timeout(12000),
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
    if (!code || discount <= 0 || discount > 95 || !this.form.expiresAt || new Date(this.form.expiresAt) <= new Date()) {
      this.toast.show('Enter a valid promo code, discount, and expiration date.', 'error');
      return;
    }

    this.saving = true;
    this.auth.ensureAccessToken(true).pipe(
      switchMap((token) => token
        ? this.promoService.createAdminPromo(code, discount, new Date(this.form.expiresAt).toISOString(), token)
        : throwError(() => new Error('No admin token'))),
      timeout(15000),
      finalize(() => {
        this.saving = false;
      })
    ).subscribe({
      next: (promo) => {
        this.saving = false;
        this.promos = [promo, ...this.promos.filter((item) => item.id !== promo.id)];
        this.form = { code: '', discountPercent: 10, expiresAt: this.defaultExpiry() };
        this.toast.show('Promo code created. Customer notifications are being sent.');
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
    return this.toLocalInputValue(date);
  }

  private today(): string {
    const date = new Date();
    return this.toDateValue(date);
  }

  private startOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  private toDateValue(date: Date): string {
    return `${date.getFullYear()}-${this.pad(date.getMonth() + 1)}-${this.pad(date.getDate())}`;
  }

  private toLocalInputValue(date: Date): string {
    return `${date.getFullYear()}-${this.pad(date.getMonth() + 1)}-${this.pad(date.getDate())}T${this.pad(date.getHours())}:${this.pad(date.getMinutes())}`;
  }

  pad(value: number): string {
    return String(value).padStart(2, '0');
  }
}
